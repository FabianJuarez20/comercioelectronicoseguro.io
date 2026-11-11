'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const { str, MAIL_RE } = require('../validate');
const { PayPalError, money } = require('../paypal');

const MAX_LINES = 50, MAX_QTY = 20;

module.exports = function ordersRoutes({ db, cfg }) {
  const router = express.Router();
  const paypal = cfg.paypalClient || require('../paypal').createPayPal(cfg);

  const byId = db.prepare('SELECT * FROM orders WHERE id = ?');
  const itemsOf = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id');
  const toApi = (o) => ({
    id: o.id, fecha: o.pagado_en || o.creado, estado: o.estado, usuario: o.usuario, cliente: o.cliente, correo: o.correo,
    total: o.total_cent / 100, moneda: o.moneda, paypalCaptureId: o.paypal_capture_id,
    items: itemsOf.all(o.id).map((i) => ({ nombre: i.nombre, cant: i.cant, precioOriginal: i.precio_original_cent / 100, descuento: i.descuento, precio: i.precio_cent / 100 })),
  });

  /* GET /api/orders/config (público) → lo que el navegador necesita para cargar el botón de PayPal.
     El client-id es público por diseño; el secreto NUNCA sale del servidor. */
  router.get('/config', (req, res) => {
    res.json({ enabled: paypal.enabled, clientId: paypal.enabled ? paypal.clientId : '', currency: paypal.currency, env: paypal.env });
  });

  /* GET /api/orders → pedidos pagados del usuario (el administrador ve todos) */
  router.get('/', requireAuth, (req, res) => {
    const base = "SELECT * FROM orders WHERE estado IN ('pagado','pendiente')";
    const rows = req.user.rol === 'admin'
      ? db.prepare(base + ' ORDER BY id DESC').all()
      : db.prepare(base + ' AND user_id = ? ORDER BY id DESC').all(req.user.id);
    res.json({ pedidos: rows.map(toApi) });
  });

  /* POST /api/orders { items:[{id,cant}], cliente, correo }
     Crea el pedido y la orden de PayPal. Los precios salen de la base de datos, NUNCA del navegador. */
  router.post('/', requireAuth,
    rateLimit({ windowMs: 15 * 60 * 1000, limit: cfg.orderMax, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados intentos de compra. Espera unos minutos.' } }),
    async (req, res, next) => {
      try {
        if (!paypal.enabled) return res.status(503).json({ error: 'Los pagos con PayPal no están configurados todavía.' });
        const d = req.body || {};
        if (!Array.isArray(d.items) || !d.items.length) return res.status(400).json({ error: 'El carrito está vacío.' });
        if (d.items.length > MAX_LINES) return res.status(400).json({ error: 'Demasiados artículos en el carrito.' });

        const cliente = str(d.cliente) || req.user.nombre;
        const correo = str(d.correo) || req.user.correo;
        if (!cliente || cliente.length > 60) return res.status(400).json({ error: 'Escribe tu nombre (máximo 60 caracteres).' });
        if (!MAIL_RE.test(correo) || correo.length > 100) return res.status(400).json({ error: 'Escribe un correo válido.' });

        // Une líneas repetidas y valida ids/cantidades
        const qty = new Map();
        for (const it of d.items) {
          const id = it && Number.isInteger(it.id) ? it.id : null;
          const cant = it && Number.isInteger(it.cant) ? it.cant : null;
          if (!id || id < 1 || !cant || cant < 1) return res.status(400).json({ error: 'Artículo o cantidad inválidos.' });
          qty.set(id, Math.min(MAX_QTY, (qty.get(id) || 0) + cant));
        }
        const ids = [...qty.keys()];
        const rows = db.prepare(`SELECT * FROM products WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
        if (rows.length !== ids.length) return res.status(409).json({ error: 'Algún juego del carrito ya no está disponible. Actualiza el carrito.' });

        const lines = rows.map((r) => ({
          product_id: r.id, nombre: r.nombre, cant: qty.get(r.id),
          precio_original_cent: r.precio_cent, descuento: r.descuento,
          precio_cent: Math.round((r.precio_cent * (100 - r.descuento)) / 100),
        }));
        const total = lines.reduce((s, l) => s + l.precio_cent * l.cant, 0);
        if (total <= 0) return res.status(400).json({ error: 'El total debe ser mayor a $0.00 para pagar con PayPal.' });

        const info = db.prepare('INSERT INTO orders (user_id,usuario,cliente,correo,total_cent,moneda) VALUES (?,?,?,?,?,?)')
          .run(req.user.id, req.user.usuario, cliente, correo, total, paypal.currency);
        const localId = Number(info.lastInsertRowid);
        const insItem = db.prepare('INSERT INTO order_items (order_id,product_id,nombre,cant,precio_original_cent,descuento,precio_cent) VALUES (?,?,?,?,?,?,?)');
        db.transaction(() => lines.forEach((l) => insItem.run(localId, l.product_id, l.nombre, l.cant, l.precio_original_cent, l.descuento, l.precio_cent)))();

        let paypalOrderId;
        try {
          paypalOrderId = await paypal.createOrder({ id: localId, items: lines, total_cent: total, moneda: paypal.currency });
        } catch (e) {
          db.prepare('DELETE FROM orders WHERE id = ?').run(localId); // no dejamos pedidos huérfanos
          throw e;
        }
        db.prepare('UPDATE orders SET paypal_order_id = ? WHERE id = ?').run(paypalOrderId, localId);
        res.status(201).json({ pedido: { id: localId, total: total / 100, moneda: paypal.currency }, paypalOrderId });
      } catch (e) { payError(e, res, next); }
    });

  /* POST /api/orders/:id/capture → cobra la orden ya aprobada por el comprador y la verifica */
  router.post('/:id/capture', requireAuth, async (req, res, next) => {
    try {
      const id = /^\d{1,9}$/.test(req.params.id) ? Number(req.params.id) : null;
      const order = id && byId.get(id);
      if (!order || order.user_id !== req.user.id) return res.status(404).json({ error: 'Pedido no encontrado.' });
      if (order.estado === 'pagado' || order.estado === 'pendiente') return res.json({ pedido: toApi(order) }); // idempotente
      if (!order.paypal_order_id) return res.status(409).json({ error: 'Este pedido no tiene una orden de PayPal.' });

      let result;
      try {
        result = await paypal.captureOrder(order.paypal_order_id, order.id);
      } catch (e) {
        if (e instanceof PayPalError && e.issue === 'ORDER_ALREADY_CAPTURED') result = await paypal.getOrder(order.paypal_order_id);
        else throw e;
      }

      // Nunca se confía en el navegador: se comprueba lo que PayPal realmente cobró.
      const pu = result && result.purchase_units && result.purchase_units[0];
      const cap = pu && pu.payments && pu.payments.captures && pu.payments.captures[0];
      const okShape = result && result.id === order.paypal_order_id && cap && cap.amount
        && cap.amount.value === money(order.total_cent) && cap.amount.currency_code === order.moneda;
      if (!okShape) {
        console.error(`Pedido ${order.id}: la captura de PayPal no coincide con el pedido.`);
        return res.status(402).json({ error: 'No se pudo confirmar el pago con PayPal. No se realizó ningún cargo en este pedido.' });
      }
      let estado;
      if (cap.status === 'COMPLETED') estado = 'pagado';
      else if (cap.status === 'PENDING') estado = 'pendiente';
      else return res.status(402).json({ error: 'PayPal no completó el pago. Intenta de nuevo o usa otro método.' });

      db.prepare("UPDATE orders SET estado = ?, paypal_capture_id = ?, pagado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
        .run(estado, cap.id || null, order.id);
      res.json({ pedido: toApi(byId.get(order.id)) });
    } catch (e) { payError(e, res, next); }
  });

  return router;
};

function payError(e, res, next) {
  if (!(e instanceof PayPalError)) return next(e);
  console.error(`PayPal: ${e.status} ${e.issue} ${e.message} ${e.debugId ? '(debug-id ' + e.debugId + ')' : ''}`);
  if (e.status === 503) return res.status(503).json({ error: 'Los pagos con PayPal no están configurados todavía.' });
  if (e.issue === 'INSTRUMENT_DECLINED') return res.status(402).json({ error: 'PayPal rechazó ese método de pago. Prueba con otro.', reintentar: true });
  if (e.status === 401) return res.status(502).json({ error: 'Las credenciales de PayPal del servidor no son válidas (revisa PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET y PAYPAL_ENV).' });
  res.status(502).json({ error: 'PayPal no respondió como se esperaba. Intenta de nuevo en un momento.' });
}
