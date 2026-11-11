'use strict';
/* Cliente mínimo de la API REST de PayPal (Orders v2). Sin dependencias: usa fetch de Node 20.
   El flujo es: el servidor crea la orden (con precios calculados aquí) → el comprador la aprueba
   en la ventana de PayPal → el servidor la captura y comprueba monto y moneda. */

const BASE = { sandbox: 'https://api-m.sandbox.paypal.com', live: 'https://api-m.paypal.com' };

class PayPalError extends Error {
  constructor(message, { status = 502, issue = '', debugId = '' } = {}) {
    super(message);
    this.name = 'PayPalError';
    this.status = status;   // HTTP devuelto por PayPal
    this.issue = issue;     // p. ej. INSTRUMENT_DECLINED, ORDER_ALREADY_CAPTURED
    this.debugId = debugId; // PayPal-Debug-Id, útil para soporte
  }
}

const money = (cent) => (cent / 100).toFixed(2);

function createPayPal(cfg) {
  const base = BASE[cfg.paypalEnv] || BASE.sandbox;
  const enabled = !!(cfg.paypalClientId && cfg.paypalSecret);
  let token = null, tokenExp = 0;

  async function call(method, path, { body, headers = {}, auth } = {}) {
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers, Authorization: auth },
        body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      throw new PayPalError('No se pudo conectar con PayPal.', { status: 0 });
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* sin cuerpo */ }
    if (!res.ok) {
      const issue = (data && data.details && data.details[0] && data.details[0].issue) || (data && data.error) || '';
      const msg = (data && (data.message || data.error_description)) || `PayPal respondió ${res.status}.`;
      throw new PayPalError(msg, { status: res.status, issue, debugId: res.headers.get('paypal-debug-id') || '' });
    }
    return data;
  }

  async function accessToken() {
    if (!enabled) throw new PayPalError('PayPal no está configurado en el servidor.', { status: 503 });
    if (token && Date.now() < tokenExp - 30000) return token;
    const basic = Buffer.from(`${cfg.paypalClientId}:${cfg.paypalSecret}`).toString('base64');
    const d = await call('POST', '/v1/oauth2/token', { body: 'grant_type=client_credentials', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, auth: `Basic ${basic}` });
    token = d.access_token;
    tokenExp = Date.now() + (Number(d.expires_in) || 300) * 1000;
    return token;
  }
  const authed = async () => `Bearer ${await accessToken()}`;

  /* order = { id, items:[{nombre,cant,precio_cent}], total_cent, moneda } */
  async function createOrder(order) {
    const itemTotal = order.items.reduce((s, i) => s + i.precio_cent * i.cant, 0);
    const body = {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: `pedido-${order.id}`,
        custom_id: String(order.id),
        description: 'Compra en Ludingo',
        amount: {
          currency_code: order.moneda,
          value: money(order.total_cent),
          breakdown: { item_total: { currency_code: order.moneda, value: money(itemTotal) } },
        },
        items: order.items.map((i) => ({
          name: i.nombre.slice(0, 127),
          quantity: String(i.cant),
          unit_amount: { currency_code: order.moneda, value: money(i.precio_cent) },
          category: 'DIGITAL_GOODS',
        })),
      }],
      application_context: { brand_name: 'Ludingo', locale: 'es-MX', user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING' },
    };
    const d = await call('POST', '/v2/checkout/orders', { body, auth: await authed(), headers: { 'PayPal-Request-Id': `crear-${order.id}-${order.total_cent}` } });
    return d.id;
  }

  const captureOrder = async (paypalOrderId, localId) =>
    call('POST', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, { body: {}, auth: await authed(), headers: { 'PayPal-Request-Id': `captura-${localId}` } });

  const getOrder = async (paypalOrderId) =>
    call('GET', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, { auth: await authed() });

  return { enabled, env: cfg.paypalEnv, clientId: cfg.paypalClientId, currency: cfg.currency, createOrder, captureOrder, getOrder };
}

module.exports = { createPayPal, PayPalError, money };
