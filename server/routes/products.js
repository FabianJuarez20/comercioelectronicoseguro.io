'use strict';
const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { checkProduct } = require('../validate');
const { GENEROS, PLATAFORMAS, PRODUCTOS } = require('../seed');
const { replaceProducts } = require('../db');

/* Fila de la base -> JSON de la API (precio en pesos; precioFinal calculado en el servidor). */
function toApi(r) {
  const finalCent = Math.round((r.precio_cent * (100 - r.descuento)) / 100);
  return {
    id: r.id, nombre: r.nombre, genero: r.genero, plataforma: r.plataforma,
    precio: r.precio_cent / 100, descuento: r.descuento, precioFinal: finalCent / 100,
    descripcion: r.descripcion, emoji: r.emoji,
  };
}
const toRow = (p) => ({ ...p, precio_cent: Math.round(p.precio * 100) });
const fold = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); // sin acentos ni mayúsculas
const union = (base, extra) => base.concat(extra).filter((v, i, a) => v && a.indexOf(v) === i);

module.exports = function productsRoutes({ db }) {
  const router = express.Router();
  const one = db.prepare('SELECT * FROM products WHERE id = ?');
  const parseId = (v) => (/^\d{1,9}$/.test(String(v)) ? Number(v) : null);

  /* GET /api/products?q=&genero=&plataforma=&ids=1,2,3  (público) */
  router.get('/', (req, res) => {
    const where = [], args = [];
    const { q, genero, plataforma, ids } = req.query;
    if (typeof genero === 'string' && genero) { where.push('genero = ?'); args.push(genero); }
    if (typeof plataforma === 'string' && plataforma) { where.push('plataforma = ?'); args.push(plataforma); }
    if (typeof ids === 'string' && ids) {
      const list = ids.split(',').map(parseId).filter((n) => n !== null).slice(0, 100);
      if (!list.length) return res.json({ productos: [] });
      where.push(`id IN (${list.map(() => '?').join(',')})`); args.push(...list);
    }
    let rows = db.prepare(`SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`).all(...args);
    if (typeof q === 'string' && q.trim()) {
      const needle = fold(q.trim().slice(0, 80));
      rows = rows.filter((r) => fold(r.nombre).includes(needle) || fold(r.descripcion).includes(needle));
    }
    res.json({ productos: rows.map(toApi) });
  });

  /* GET /api/products/meta → géneros y plataformas disponibles (para los filtros) */
  router.get('/meta', (req, res) => {
    const col = (c) => db.prepare(`SELECT DISTINCT ${c} v FROM products ORDER BY ${c}`).all().map((r) => r.v);
    res.json({ generos: union(GENEROS, col('genero')), plataformas: union(PLATAFORMAS, col('plataforma')) });
  });

  /* POST /api/products/import (admin) → reemplaza el catálogo con la lista enviada */
  router.post('/import', requireAdmin, (req, res) => {
    const list = (req.body || {}).productos;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'Envía { "productos": [ ... ] }.' });
    if (list.length > 500) return res.status(400).json({ error: 'Máximo 500 productos por importación.' });
    const valid = list.map((p) => checkProduct(p, { lenient: true })).filter((r) => r.value).map((r) => r.value);
    if (!valid.length) return res.status(400).json({ error: 'Ningún producto válido. Cada uno necesita nombre y precio.' });
    replaceProducts(db, valid);
    res.json({ importados: valid.length, omitidos: list.length - valid.length });
  });

  /* POST /api/products/reset (admin) → restaura el catálogo inicial */
  router.post('/reset', requireAdmin, (req, res) => {
    replaceProducts(db, PRODUCTOS);
    res.json({ ok: true, total: PRODUCTOS.length });
  });

  /* GET /api/products/:id (público) */
  router.get('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const r = id && one.get(id);
    if (!r) return res.status(404).json({ error: 'Producto no encontrado.' });
    res.json({ producto: toApi(r) });
  });

  /* POST /api/products (admin) */
  router.post('/', requireAdmin, (req, res) => {
    const { error, value } = checkProduct(req.body);
    if (error) return res.status(400).json({ error });
    const info = db.prepare(`INSERT INTO products (nombre,genero,plataforma,precio_cent,descuento,descripcion,emoji)
                             VALUES (@nombre,@genero,@plataforma,@precio_cent,@descuento,@descripcion,@emoji)`).run(toRow(value));
    res.status(201).json({ producto: toApi(one.get(info.lastInsertRowid)) });
  });

  /* PUT /api/products/:id (admin) */
  router.put('/:id', requireAdmin, (req, res) => {
    const id = parseId(req.params.id);
    if (!id || !one.get(id)) return res.status(404).json({ error: 'Producto no encontrado.' });
    const { error, value } = checkProduct(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare(`UPDATE products SET nombre=@nombre, genero=@genero, plataforma=@plataforma, precio_cent=@precio_cent,
                descuento=@descuento, descripcion=@descripcion, emoji=@emoji WHERE id=@id`).run({ ...toRow(value), id });
    res.json({ producto: toApi(one.get(id)) });
  });

  /* DELETE /api/products/:id (admin) */
  router.delete('/:id', requireAdmin, (req, res) => {
    const id = parseId(req.params.id);
    if (!id || !one.get(id)) return res.status(404).json({ error: 'Producto no encontrado.' });
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  return router;
};
module.exports.toApi = toApi;
