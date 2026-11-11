'use strict';
const express = require('express');
const { hashPassword, hashToken } = require('../security');
const { requireAdmin, publicUser } = require('../middleware/auth');
const { checkUser, checkPass, normUser, str } = require('../validate');

const ROLES = ['admin', 'usuario'];

/* Gestión de usuarios: solo administradores. */
module.exports = function usersRoutes({ db }) {
  const router = express.Router();
  router.use(requireAdmin);

  const byUser = db.prepare('SELECT * FROM users WHERE usuario = ?');
  const countAdmins = () => db.prepare("SELECT COUNT(*) n FROM users WHERE rol = 'admin'").get().n;

  router.get('/', (req, res) => {
    res.json({ usuarios: db.prepare('SELECT usuario,nombre,correo,rol,creado FROM users ORDER BY id').all() });
  });

  router.post('/', async (req, res) => {
    const d = req.body || {};
    const err = checkUser(d);
    if (err) return res.status(400).json({ error: err });
    const rol = d.rol === undefined ? 'usuario' : d.rol;
    if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido.' });
    const usuario = normUser(d.usuario), correo = str(d.correo);
    if (byUser.get(usuario)) return res.status(409).json({ error: 'Ese usuario ya existe.' });
    if (db.prepare('SELECT 1 FROM users WHERE correo = ?').get(correo)) return res.status(409).json({ error: 'Ese correo ya está registrado.' });
    const hash = await hashPassword(d.pass);
    db.prepare('INSERT INTO users (usuario,nombre,correo,rol,pass_hash) VALUES (?,?,?,?,?)').run(usuario, str(d.nombre), correo, rol, hash);
    res.status(201).json({ user: publicUser(byUser.get(usuario)) });
  });

  router.patch('/:usuario', (req, res) => {
    const t = byUser.get(normUser(req.params.usuario));
    if (!t) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const rol = (req.body || {}).rol;
    if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido.' });
    if (t.id === req.user.id && rol !== 'admin') return res.status(400).json({ error: 'No puedes quitarte tu propio rol de administrador.' });
    if (t.rol === 'admin' && rol !== 'admin' && countAdmins() < 2) return res.status(400).json({ error: 'Debe quedar al menos un administrador.' });
    db.prepare('UPDATE users SET rol = ? WHERE id = ?').run(rol, t.id);
    res.json({ user: publicUser(byUser.get(t.usuario)) });
  });

  router.put('/:usuario/password', async (req, res) => {
    const t = byUser.get(normUser(req.params.usuario));
    if (!t) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const pass = (req.body || {}).pass;
    const err = checkPass(pass);
    if (err) return res.status(400).json({ error: err });
    db.transaction((hash) => {
      db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hash, t.id);
      // al cambiar la contraseña se cierran las demás sesiones de esa cuenta
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')
        .run(t.id, t.id === req.user.id ? hashToken(req.sessionToken) : '');
    })(await hashPassword(pass));
    res.json({ ok: true });
  });

  router.delete('/:usuario', (req, res) => {
    const t = byUser.get(normUser(req.params.usuario));
    if (!t) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (t.id === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    if (t.rol === 'admin' && countAdmins() < 2) return res.status(400).json({ error: 'Debe quedar al menos un administrador.' });
    db.prepare('DELETE FROM users WHERE id = ?').run(t.id); // sus sesiones se borran en cascada
    res.json({ ok: true });
  });

  return router;
};
