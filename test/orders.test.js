'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const { createPayPal, PayPalError } = require('../server/paypal');

let srv, base, ctx, pp;
const ADMIN_PASS = 'Admin-Segura-1';

function client() {
  let cookie = '';
  const api = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const sc = res.headers.getSetCookie();
    if (sc.length) { const c = sc[0].split(';')[0]; cookie = c.endsWith('=') ? '' : c; }
    let data = null; try { data = await res.json(); } catch (e) { /* sin cuerpo */ }
    return { status: res.status, data };
  };
  api.get = (u) => api('GET', u); api.post = (u, b) => api('POST', u, b ?? {});
  return api;
}
const newUser = async (usuario) => { const c = client(); const r = await c.post('/api/auth/register', { usuario, nombre: 'Persona ' + usuario, correo: usuario + '@mail.com', pass: 'Clave-12345' }); assert.equal(r.status, 201); return c; };

/* PayPal falso: guarda lo que recibe y responde como la API real. */
function fakePayPal() {
  const f = {
    enabled: true, clientId: 'CLIENT_ID_PUBLICO', env: 'sandbox', currency: 'MXN',
    created: [], nextId: 1, captureMode: 'ok', failCreate: false,
    async createOrder(o) { if (f.failCreate) throw new PayPalError('boom', { status: 500 }); f.created.push(o); return 'PP-ORDER-' + f.nextId++; },
    async captureOrder(ppId, localId) {
      const o = f.created.find((x) => x.id === localId);
      const money = (c) => (c / 100).toFixed(2);
      if (f.captureMode === 'declined') throw new PayPalError('declined', { status: 422, issue: 'INSTRUMENT_DECLINED' });
      if (f.captureMode === 'already') throw new PayPalError('already', { status: 422, issue: 'ORDER_ALREADY_CAPTURED' });
      const value = f.captureMode === 'wrong-amount' ? '1.00' : money(o.total_cent);
      return { id: ppId, status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAP-' + localId, status: f.captureMode === 'pending' ? 'PENDING' : 'COMPLETED', amount: { currency_code: 'MXN', value } }] } }] };
    },
    async getOrder(ppId) { const o = f.created[Number(ppId.split('-').pop()) - 1]; return f.captureOrder(ppId, o.id).catch(() => null) || null; },
  };
  return f;
}

before(async () => {
  pp = fakePayPal();
  ctx = await createApp({ dbPath: ':memory:', adminPass: ADMIN_PASS, log: false, loginMax: 1000, paypalClient: pp });
  await new Promise((ok) => { srv = ctx.app.listen(0, '127.0.0.1', ok); });
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => { srv.close(); ctx.close(); });

test('config pública: da el client-id y nunca el secreto', async () => {
  const r = await client().get('/api/orders/config');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { enabled: true, clientId: 'CLIENT_ID_PUBLICO', currency: 'MXN', env: 'sandbox' });
});

test('el CSP permite PayPal y la ventana emergente', async () => {
  const res = await fetch(base + '/carrito.html');
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /script-src[^;]*https:\/\/\*\.paypal\.com/);
  assert.match(csp, /frame-src[^;]*https:\/\/\*\.paypal\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/\*\.paypal\.com/);
  assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
});

test('crear pedido exige sesión', async () => {
  assert.equal((await client().post('/api/orders', { items: [{ id: 1, cant: 1 }] })).status, 401);
  assert.equal((await client().get('/api/orders')).status, 401);
});

test('crear pedido: el servidor calcula el total e ignora los precios del navegador', async () => {
  const c = await newUser('comprador1');
  // producto 1: $499 con 20 % → $399.20 ×2 ; producto 2: $699 sin descuento
  const r = await c.post('/api/orders', { items: [{ id: 1, cant: 1, precio: 0.01 }, { id: 1, cant: 1 }, { id: 2, cant: 1 }], total: 1, cliente: 'Comprador Uno', correo: 'c1@mail.com' });
  assert.equal(r.status, 201);
  assert.match(r.data.paypalOrderId, /^PP-ORDER-/);
  assert.equal(r.data.pedido.total, 1497.4);
  const sent = pp.created.at(-1);
  assert.equal(sent.total_cent, 149740);
  assert.equal(sent.moneda, 'MXN');
  assert.deepEqual(sent.items.map((i) => [i.nombre, i.cant, i.precio_cent]).sort(), [['Cyber Arena Online', 2, 39920], ['Reinos de Eldoria', 1, 69900]]);
  // todavía no está pagado: no aparece en el historial
  assert.equal((await c.get('/api/orders')).data.pedidos.length, 0);
});

test('crear pedido: validaciones', async () => {
  const c = await newUser('comprador2');
  for (const body of [{}, { items: [] }, { items: [{ id: 1, cant: 0 }] }, { items: [{ id: 'x', cant: 1 }] }, { items: [{ id: 1, cant: 1.5 }] }, { items: [{ id: 1, cant: 1 }], correo: 'malo' }]) {
    assert.equal((await c.post('/api/orders', body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await c.post('/api/orders', { items: [{ id: 9999, cant: 1 }] })).status, 409);   // juego que ya no existe
});

test('crear pedido: gratis no se manda a PayPal y un fallo de PayPal no deja pedidos huérfanos', async () => {
  const admin = client(); await admin.post('/api/auth/login', { usuario: 'admin', pass: ADMIN_PASS });
  const free = (await admin.post('/api/products', { nombre: 'Demo gratis', genero: 'Puzzle', plataforma: 'PC', precio: 0 })).data.producto;
  const c = await newUser('comprador3');
  assert.equal((await c.post('/api/orders', { items: [{ id: free.id, cant: 1 }] })).status, 400);
  const before = ctx.db.prepare('SELECT COUNT(*) n FROM orders').get().n;
  pp.failCreate = true;
  assert.equal((await c.post('/api/orders', { items: [{ id: 2, cant: 1 }] })).status, 502);
  pp.failCreate = false;
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM orders').get().n, before);
});

test('captura: marca pagado, es idempotente y aparece en el historial del dueño', async () => {
  const c = await newUser('comprador4');
  const o = (await c.post('/api/orders', { items: [{ id: 2, cant: 1 }], cliente: 'Cuatro', correo: 'c4@mail.com' })).data;
  const r = await c.post(`/api/orders/${o.pedido.id}/capture`);
  assert.equal(r.status, 200);
  assert.equal(r.data.pedido.estado, 'pagado');
  assert.equal(r.data.pedido.total, 699);
  assert.equal(r.data.pedido.paypalCaptureId, 'CAP-' + o.pedido.id);
  assert.equal((await c.post(`/api/orders/${o.pedido.id}/capture`)).data.pedido.estado, 'pagado');  // doble clic
  const list = (await c.get('/api/orders')).data.pedidos;
  assert.equal(list.length, 1);
  assert.equal(list[0].items[0].nombre, 'Reinos de Eldoria');
});

test('captura: otro usuario no puede cobrar ni ver pedidos ajenos; el admin ve todos', async () => {
  const a = await newUser('dueno1'), b = await newUser('intruso1');
  const o = (await a.post('/api/orders', { items: [{ id: 2, cant: 1 }] })).data;
  assert.equal((await b.post(`/api/orders/${o.pedido.id}/capture`)).status, 404);
  assert.equal((await client().post(`/api/orders/${o.pedido.id}/capture`)).status, 401);
  await a.post(`/api/orders/${o.pedido.id}/capture`);
  assert.equal((await b.get('/api/orders')).data.pedidos.length, 0);
  const admin = client(); await admin.post('/api/auth/login', { usuario: 'admin', pass: ADMIN_PASS });
  assert.ok((await admin.get('/api/orders')).data.pedidos.length >= 2);
});

test('captura: si PayPal cobró otro monto, el pedido NO se marca como pagado', async () => {
  const c = await newUser('comprador5');
  const o = (await c.post('/api/orders', { items: [{ id: 2, cant: 1 }] })).data;
  pp.captureMode = 'wrong-amount';
  const r = await c.post(`/api/orders/${o.pedido.id}/capture`);
  pp.captureMode = 'ok';
  assert.equal(r.status, 402);
  assert.equal((await c.get('/api/orders')).data.pedidos.length, 0);
});

test('captura: rechazo de tarjeta permite reintentar; pago pendiente queda "pendiente"', async () => {
  const c = await newUser('comprador6');
  const o = (await c.post('/api/orders', { items: [{ id: 2, cant: 1 }] })).data;
  pp.captureMode = 'declined';
  const bad = await c.post(`/api/orders/${o.pedido.id}/capture`);
  assert.equal(bad.status, 402); assert.equal(bad.data.reintentar, true);
  pp.captureMode = 'pending';
  const r = await c.post(`/api/orders/${o.pedido.id}/capture`);
  pp.captureMode = 'ok';
  assert.equal(r.data.pedido.estado, 'pendiente');
});

test('captura: ORDER_ALREADY_CAPTURED se resuelve consultando la orden', async () => {
  const c = await newUser('comprador7');
  const o = (await c.post('/api/orders', { items: [{ id: 2, cant: 1 }] })).data;
  pp.captureMode = 'already';
  pp.getOrder = async (ppId) => ({ id: ppId, status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAP-X', status: 'COMPLETED', amount: { currency_code: 'MXN', value: '699.00' } }] } }] });
  const r = await c.post(`/api/orders/${o.pedido.id}/capture`);
  pp.captureMode = 'ok';
  assert.equal(r.data.pedido.estado, 'pagado');
});

test('sin credenciales de PayPal: config deshabilitada y 503 al pagar', async () => {
  const c2 = await createApp({ dbPath: ':memory:', adminPass: ADMIN_PASS, log: false, paypalClientId: '', paypalSecret: '' });
  const s2 = await new Promise((ok) => { const s = c2.app.listen(0, '127.0.0.1', () => ok(s)); });
  const b2 = `http://127.0.0.1:${s2.address().port}`;
  try {
    const cfg = await (await fetch(b2 + '/api/orders/config')).json();
    assert.equal(cfg.enabled, false); assert.equal(cfg.clientId, '');
    const reg = await fetch(b2 + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'sinpp', nombre: 'X', correo: 'x@mail.com', pass: 'Clave-12345' }) });
    const cookie = reg.headers.getSetCookie()[0].split(';')[0];
    const r = await fetch(b2 + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ items: [{ id: 1, cant: 1 }] }) });
    assert.equal(r.status, 503);
  } finally { s2.close(); c2.close(); }
});

test('cliente PayPal: pide token con Basic auth y arma una orden cuyo desglose cuadra', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/v1/oauth2/token')) return json({ access_token: 'TOK', expires_in: 3000 });
    return json({ id: 'ORDEN123' }, 201);
  };
  try {
    const real = createPayPal({ paypalEnv: 'sandbox', paypalClientId: 'cid', paypalSecret: 'sec', currency: 'MXN' });
    const id = await real.createOrder({ id: 7, moneda: 'MXN', total_cent: 149740, items: [{ nombre: 'A', cant: 2, precio_cent: 39920 }, { nombre: 'B', cant: 1, precio_cent: 69900 }] });
    assert.equal(id, 'ORDEN123');
    assert.equal(calls[0].url, 'https://api-m.sandbox.paypal.com/v1/oauth2/token');
    assert.equal(calls[0].opts.headers.Authorization, 'Basic ' + Buffer.from('cid:sec').toString('base64'));
    assert.equal(calls[1].url, 'https://api-m.sandbox.paypal.com/v2/checkout/orders');
    assert.equal(calls[1].opts.headers.Authorization, 'Bearer TOK');
    const body = JSON.parse(calls[1].opts.body), pu = body.purchase_units[0];
    assert.equal(body.intent, 'CAPTURE');
    assert.deepEqual(pu.amount, { currency_code: 'MXN', value: '1497.40', breakdown: { item_total: { currency_code: 'MXN', value: '1497.40' } } });
    assert.equal(pu.items[0].unit_amount.value, '399.20');
    assert.equal(pu.items[0].quantity, '2');
    await real.createOrder({ id: 8, moneda: 'MXN', total_cent: 100, items: [{ nombre: 'C', cant: 1, precio_cent: 100 }] });
    assert.equal(calls.filter((c) => c.url.endsWith('/oauth2/token')).length, 1);   // el token se reutiliza
  } finally { globalThis.fetch = realFetch; }
});
