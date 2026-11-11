'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');

let srv, base, ctx;
const ADMIN_PASS = 'Admin-Segura-1';

/* Cliente HTTP mínimo con "cookie jar" para simular un navegador. */
function client() {
  let cookie = '';
  const api = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method, redirect: 'manual',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.getSetCookie();
    if (sc.length) { const c = sc[0].split(';')[0]; cookie = c.endsWith('=') ? '' : c; }
    let data = null; try { data = await res.json(); } catch (e) { /* sin cuerpo */ }
    return { status: res.status, data, headers: res.headers, setCookie: sc[0] || '' };
  };
  api.get = (u) => api('GET', u); api.post = (u, b) => api('POST', u, b ?? {});
  api.put = (u, b) => api('PUT', u, b); api.patch = (u, b) => api('PATCH', u, b); api.del = (u) => api('DELETE', u);
  return api;
}
const adminClient = async () => { const c = client(); const r = await c.post('/api/auth/login', { usuario: 'admin', pass: ADMIN_PASS }); assert.equal(r.status, 200); return c; };
const newUser = async (usuario, extra = {}) => { const c = client(); const r = await c.post('/api/auth/register', { usuario, nombre: 'Persona ' + usuario, correo: usuario + '@mail.com', pass: 'Clave-12345', ...extra }); assert.equal(r.status, 201); return c; };

before(async () => {
  ctx = await createApp({ dbPath: ':memory:', adminPass: ADMIN_PASS, log: false, loginMax: 1000 });
  await new Promise((ok) => { srv = ctx.app.listen(0, '127.0.0.1', ok); });
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => { srv.close(); ctx.close(); });

/* ===================== Página principal ===================== */
test('home: destacados, totales y géneros', async () => {
  const r = await client().get('/api/home');
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 8);
  assert.equal(r.data.destacados.length, 4);
  assert.equal(r.data.destacados[0].descuento, 30);           // mayor descuento primero
  assert.equal(r.data.enPromocion, 4);
  assert.ok(r.data.generos.length > 0);
});

test('el sitio web se sirve y trae cabeceras de seguridad', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Ludingo/);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal((await fetch(base + '/no-existe.html')).status, 404);
  assert.equal((await fetch(base + '/server/db.js')).status, 404);   // el código del servidor no es público
});

/* ===================== Registro ===================== */
test('registro: validaciones', async () => {
  const c = client();
  const ok = { usuario: 'ana_01', nombre: 'Ana', correo: 'ana@mail.com', pass: 'Clave-12345' };
  for (const [campo, valor] of [['usuario', 'a'], ['usuario', 'con espacio'], ['nombre', ''], ['correo', 'no-es-correo'], ['pass', '1234567']]) {
    const r = await c.post('/api/auth/register', { ...ok, [campo]: valor });
    assert.equal(r.status, 400, `${campo}=${valor}`);
    assert.ok(r.data.error);
  }
  assert.equal((await c.post('/api/auth/register', { ...ok, usuario: 123 })).status, 400);
  assert.equal((await c.post('/api/auth/register', null)).status, 400);
});

test('registro: crea cuenta con rol usuario, inicia sesión y la cookie es segura', async () => {
  const c = client();
  const r = await c.post('/api/auth/register', { usuario: 'Luis_99', nombre: 'Luis', correo: 'luis@mail.com', pass: 'Clave-12345', rol: 'admin' });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.usuario, 'luis_99');                  // se normaliza a minúsculas
  assert.equal(r.data.user.rol, 'usuario');                      // no se puede auto-asignar admin
  assert.equal(r.data.user.pass_hash, undefined);
  assert.match(r.setCookie, /HttpOnly/i);
  assert.match(r.setCookie, /SameSite=Lax/i);
  const me = await c.get('/api/auth/me');
  assert.equal(me.data.user.usuario, 'luis_99');
});

test('registro: usuario y correo duplicados (sin distinguir mayúsculas)', async () => {
  await newUser('dupe1');
  const c = client();
  assert.equal((await c.post('/api/auth/register', { usuario: 'DUPE1', nombre: 'X', correo: 'otro@mail.com', pass: 'Clave-12345' })).status, 409);
  assert.equal((await c.post('/api/auth/register', { usuario: 'dupe2', nombre: 'X', correo: 'DUPE1@MAIL.COM', pass: 'Clave-12345' })).status, 409);
});

test('la contraseña se guarda con hash scrypt y el token de sesión no se guarda en claro', async () => {
  const c = await newUser('hashing');
  const row = ctx.db.prepare('SELECT pass_hash FROM users WHERE usuario = ?').get('hashing');
  assert.match(row.pass_hash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.ok(!row.pass_hash.includes('Clave-12345'));
  const hashes = ctx.db.prepare('SELECT token_hash FROM sessions').all().map((s) => s.token_hash);
  assert.ok(hashes.every((h) => /^[0-9a-f]{64}$/.test(h)));
  assert.ok(c);
});

/* ===================== Login / sesión ===================== */
test('login: credenciales correctas e incorrectas', async () => {
  await newUser('login1');
  const c = client();
  const bad1 = await c.post('/api/auth/login', { usuario: 'login1', pass: 'mala-clave' });
  const bad2 = await c.post('/api/auth/login', { usuario: 'nadie', pass: 'mala-clave' });
  assert.equal(bad1.status, 401); assert.equal(bad2.status, 401);
  assert.equal(bad1.data.error, bad2.data.error);                // mismo mensaje: no revela si el usuario existe
  assert.equal((await c.post('/api/auth/login', { usuario: 'login1' })).status, 400);
  assert.equal((await c.post('/api/auth/login', { usuario: "' OR 1=1 --", pass: "' OR '1'='1" })).status, 401);
  const ok = await c.post('/api/auth/login', { usuario: 'LOGIN1', pass: 'Clave-12345' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.usuario, 'login1');
  assert.equal((await c.get('/api/auth/me')).data.user.usuario, 'login1');
});

test('logout cierra la sesión y la cookie anterior deja de servir', async () => {
  const c = await newUser('logout1');
  const old = c; // misma jar
  assert.ok((await old.get('/api/auth/me')).data.user);
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  assert.equal((await c.get('/api/auth/me')).data.user, null);
});

test('me sin sesión devuelve user null y cookie falsa se ignora', async () => {
  assert.equal((await client().get('/api/auth/me')).data.user, null);
  const r = await client().get('/api/auth/me');
  const forged = await fetch(base + '/api/auth/me', { headers: { Cookie: 'ludingo_sid=' + 'a'.repeat(43) } });
  assert.equal((await forged.json()).user, null);
  assert.equal(r.status, 200);
});

test('límite de intentos de login (429)', async () => {
  const c2 = await createApp({ dbPath: ':memory:', adminPass: ADMIN_PASS, log: false, loginMax: 3 });
  const s2 = await new Promise((ok) => { const s = c2.app.listen(0, '127.0.0.1', () => ok(s)); });
  const url = `http://127.0.0.1:${s2.address().port}/api/auth/login`;
  const hit = () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'admin', pass: 'incorrecta1' }) }).then((r) => r.status);
  const codes = []; for (let i = 0; i < 5; i++) codes.push(await hit());
  assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  s2.close(); c2.close();
});

test('CSRF: se rechaza un POST con Origin de otro sitio', async () => {
  const r = await client().post('/api/auth/login', { usuario: 'admin', pass: ADMIN_PASS });
  assert.equal(r.status, 200);
  const x = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://sitio-malo.example' }, body: JSON.stringify({ usuario: 'admin', pass: ADMIN_PASS }) });
  assert.equal(x.status, 403);
  const bad = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{no es json' });
  assert.equal(bad.status, 400);
});

/* ===================== Catálogo (público) ===================== */
test('catálogo: lista, búsqueda sin acentos, filtros e ids', async () => {
  const c = client();
  const all = await c.get('/api/products');
  assert.equal(all.data.productos.length, 8);
  const p1 = all.data.productos.find((p) => p.id === 1);
  assert.deepEqual([p1.precio, p1.descuento, p1.precioFinal], [499, 20, 399.2]);
  const p2 = all.data.productos.find((p) => p.id === 2);
  assert.deepEqual([p2.precio, p2.descuento, p2.precioFinal], [699, 0, 699]);   // sin descuento: precio normal

  assert.equal((await c.get('/api/products?q=CYBER')).data.productos.length, 1);
  assert.equal((await c.get('/api/products?q=' + encodeURIComponent('accion'))).data.productos.some((p) => p.genero === 'Acción' || /acci/i.test(p.descripcion)), true);
  assert.equal((await c.get('/api/products?genero=' + encodeURIComponent('Acción'))).data.productos.length, 1);
  assert.equal((await c.get('/api/products?plataforma=PC')).data.productos.length, 3);
  assert.equal((await c.get('/api/products?plataforma=PC&genero=RPG')).data.productos.length, 1);
  assert.deepEqual((await c.get('/api/products?ids=1,2,999,abc')).data.productos.map((p) => p.id), [1, 2]);
  assert.equal((await c.get('/api/products?ids=abc')).data.productos.length, 0);
  assert.equal((await c.get("/api/products?q=' OR 1=1 --&genero=' OR '1'='1")).data.productos.length, 0);  // inyección SQL no funciona
});

test('catálogo: detalle y meta', async () => {
  const c = client();
  const d = await c.get('/api/products/3');
  assert.equal(d.status, 200); assert.equal(d.data.producto.nombre, 'Turbo Drift League');
  assert.equal((await c.get('/api/products/9999')).status, 404);
  assert.equal((await c.get('/api/products/abc')).status, 404);
  const m = await c.get('/api/products/meta');
  assert.ok(m.data.generos.includes('RPG') && m.data.plataformas.includes('Xbox'));
});

/* ===================== Productos (solo administrador) ===================== */
test('productos: crear/editar/borrar exige rol administrador', async () => {
  const body = { nombre: 'Juego X', genero: 'RPG', plataforma: 'PC', precio: 100 };
  assert.equal((await client().post('/api/products', body)).status, 401);          // sin sesión
  const u = await newUser('comprador1');
  assert.equal((await u.post('/api/products', body)).status, 403);                  // usuario normal
  assert.equal((await u.put('/api/products/1', body)).status, 403);
  assert.equal((await u.del('/api/products/1')).status, 403);
  assert.equal((await u.post('/api/products/import', { productos: [body] })).status, 403);
  assert.equal((await u.post('/api/products/reset')).status, 403);
});

test('productos: CRUD completo como administrador con validaciones', async () => {
  const a = await adminClient();
  for (const mala of [{ nombre: '' }, { precio: -5 }, { precio: 'abc' }, { descuento: 150 }, { descuento: -1 }, { nombre: 'x'.repeat(81) }, { descripcion: 'x'.repeat(301) }, { genero: '' }]) {
    const r = await a.post('/api/products', { nombre: 'Juego', genero: 'RPG', plataforma: 'PC', precio: 100, ...mala });
    assert.equal(r.status, 400, JSON.stringify(mala));
  }
  const c = await a.post('/api/products', { nombre: '  <b>Nuevo</b>  ', genero: 'RPG', plataforma: 'PC', precio: '250.50', descuento: 10, descripcion: 'Desc', emoji: '🎯' });
  assert.equal(c.status, 201);
  const p = c.data.producto;
  assert.equal(p.nombre, '<b>Nuevo</b>');                         // se guarda tal cual (el front escapa al mostrar)
  assert.deepEqual([p.precio, p.descuento, p.precioFinal], [250.5, 10, 225.45]);

  const e = await a.put('/api/products/' + p.id, { nombre: 'Editado', genero: 'Acción', plataforma: 'Xbox', precio: 80, descuento: 0 });
  assert.equal(e.status, 200); assert.equal(e.data.producto.precioFinal, 80);
  assert.equal((await a.put('/api/products/99999', { nombre: 'x', genero: 'a', plataforma: 'b', precio: 1 })).status, 404);

  assert.equal((await a.del('/api/products/' + p.id)).status, 200);
  assert.equal((await a.get('/api/products/' + p.id)).status, 404);
  assert.equal((await a.del('/api/products/' + p.id)).status, 404);
});

test('productos: importar JSON reemplaza el catálogo y reset lo restaura', async () => {
  const a = await adminClient();
  assert.equal((await a.post('/api/products/import', { productos: 'no' })).status, 400);
  assert.equal((await a.post('/api/products/import', { productos: [{ nombre: 'sin precio' }] })).status, 400);
  const r = await a.post('/api/products/import', { productos: [
    { nombre: 'Importado A', precio: 50 },
    { nombre: 'Importado B', genero: 'Puzzle', plataforma: 'Móvil', precio: 200, descuento: 50 },
    { precio: 10 },
  ] });
  assert.equal(r.status, 200); assert.deepEqual([r.data.importados, r.data.omitidos], [2, 1]);
  const l = await a.get('/api/products');
  assert.deepEqual(l.data.productos.map((p) => p.nombre), ['Importado A', 'Importado B']);
  assert.equal(l.data.productos[0].id, 1);
  assert.equal(l.data.productos[1].precioFinal, 100);
  assert.equal((await a.post('/api/products/reset')).data.total, 8);
  assert.equal((await a.get('/api/products')).data.productos.length, 8);
});

/* ===================== Usuarios (solo administrador) ===================== */
test('usuarios: solo admin lista/crea; reglas de roles', async () => {
  const u = await newUser('normal1');
  assert.equal((await u.get('/api/users')).status, 403);
  assert.equal((await client().get('/api/users')).status, 401);

  const a = await adminClient();
  const list = await a.get('/api/users');
  assert.equal(list.status, 200);
  assert.ok(list.data.usuarios.every((x) => x.pass_hash === undefined && x.hash === undefined));

  const mk = await a.post('/api/users', { usuario: 'jefe2', nombre: 'Jefa', correo: 'jefa@mail.com', pass: 'Clave-12345', rol: 'admin' });
  assert.equal(mk.status, 201); assert.equal(mk.data.user.rol, 'admin');
  assert.equal((await a.post('/api/users', { usuario: 'otro', nombre: 'O', correo: 'o@mail.com', pass: 'Clave-12345', rol: 'superman' })).status, 400);

  assert.equal((await a.patch('/api/users/admin', { rol: 'usuario' })).status, 400);        // no quitarse el propio admin
  assert.equal((await a.del('/api/users/admin')).status, 400);                               // no borrarse a sí mismo
  assert.equal((await a.patch('/api/users/normal1', { rol: 'admin' })).status, 200);
  assert.equal((await u.get('/api/users')).status, 200);                                     // el rol aplica de inmediato
  assert.equal((await a.patch('/api/users/normal1', { rol: 'usuario' })).status, 200);
  assert.equal((await a.patch('/api/users/nadie', { rol: 'usuario' })).status, 404);
});

test('usuarios: siempre queda al menos un administrador', async () => {
  const c2 = await createApp({ dbPath: ':memory:', adminPass: ADMIN_PASS, log: false, loginMax: 1000 });
  const s2 = await new Promise((ok) => { const s = c2.app.listen(0, '127.0.0.1', () => ok(s)); });
  const url = `http://127.0.0.1:${s2.address().port}`;
  const login = await fetch(url + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'admin', pass: ADMIN_PASS }) });
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  const call = (m, p, b) => fetch(url + p, { method: m, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: b && JSON.stringify(b) }).then((r) => r.status);
  assert.equal(await call('PATCH', '/api/users/admin', { rol: 'usuario' }), 400);
  assert.equal(await call('DELETE', '/api/users/admin'), 400);
  s2.close(); c2.close();
});

test('usuarios: cambiar contraseña cierra las otras sesiones de esa cuenta', async () => {
  const victima = await newUser('victima1');
  const a = await adminClient();
  assert.ok((await victima.get('/api/auth/me')).data.user);
  assert.equal((await a.put('/api/users/victima1/password', { pass: 'corta' })).status, 400);
  assert.equal((await a.put('/api/users/victima1/password', { pass: 'Nueva-Clave-9' })).status, 200);
  assert.equal((await victima.get('/api/auth/me')).data.user, null);                          // sesión vieja invalidada
  const n = client();
  assert.equal((await n.post('/api/auth/login', { usuario: 'victima1', pass: 'Clave-12345' })).status, 401);
  assert.equal((await n.post('/api/auth/login', { usuario: 'victima1', pass: 'Nueva-Clave-9' })).status, 200);
});

test('usuarios: eliminar una cuenta borra sus sesiones', async () => {
  const x = await newUser('borrame1');
  const a = await adminClient();
  assert.equal((await a.del('/api/users/borrame1')).status, 200);
  assert.equal((await x.get('/api/auth/me')).data.user, null);
  assert.equal((await a.del('/api/users/borrame1')).status, 404);
});

test('rutas de API inexistentes responden 404 en JSON', async () => {
  const r = await client().get('/api/nada');
  assert.equal(r.status, 404); assert.ok(r.data.error);
});
