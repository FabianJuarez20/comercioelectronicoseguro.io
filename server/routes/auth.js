'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { hashPassword, verifyPassword, dummyVerify, newToken, hashToken } = require('../security');
const { COOKIE, publicUser } = require('../middleware/auth');
const { checkUser, normUser, str } = require('../validate');

module.exports = function authRoutes({ db, cfg }) {
  const router = express.Router();

  const limiterOpts = (windowMs, limit, msg) => ({
    windowMs, limit, standardHeaders: true, legacyHeaders: false,
    message: { error: msg },
  });
  const loginLimiter = rateLimit({ ...limiterOpts(15 * 60 * 1000, cfg.loginMax, 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.'), skipSuccessfulRequests: true });
  const registerLimiter = rateLimit(limiterOpts(60 * 60 * 1000, cfg.registerMax, 'Demasiados registros desde esta conexión. Inténtalo más tarde.'));

  const cookieOpts = () => ({
    httpOnly: true, sameSite: 'lax', secure: cfg.cookieSecure, path: '/',
    maxAge: cfg.sessionDays * 24 * 3600 * 1000,
  });

  const delExpired = db.prepare('DELETE FROM sessions WHERE expira <= ?');
  const insSession = db.prepare('INSERT INTO sessions (token_hash, user_id, expira) VALUES (?,?,?)');
  const delSession = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const getUserById = db.prepare('SELECT id, usuario, nombre, correo, rol, creado FROM users WHERE id = ?');

  function startSession(res, userId) {
    delExpired.run(Date.now());
    const token = newToken();
    insSession.run(hashToken(token), userId, Date.now() + cfg.sessionDays * 24 * 3600 * 1000);
    res.cookie(COOKIE, token, cookieOpts());
  }

  /* GET /api/auth/me → { user } (user = null si no hay sesión) */
  router.get('/me', (req, res) => {
    res.json({ user: req.user ? publicUser(req.user) : null });
  });

  /* POST /api/auth/register → crea una cuenta con rol "usuario" e inicia sesión */
  router.post('/register', registerLimiter, async (req, res) => {
    const d = req.body || {};
    const err = checkUser(d);
    if (err) return res.status(400).json({ error: err });
    const usuario = normUser(d.usuario), correo = str(d.correo);
    if (db.prepare('SELECT 1 FROM users WHERE usuario = ?').get(usuario)) return res.status(409).json({ error: 'Ese usuario ya existe.' });
    if (db.prepare('SELECT 1 FROM users WHERE correo = ?').get(correo)) return res.status(409).json({ error: 'Ese correo ya está registrado.' });
    const hash = await hashPassword(d.pass);
    let id;
    try {
      id = db.prepare('INSERT INTO users (usuario,nombre,correo,rol,pass_hash) VALUES (?,?,?,?,?)')
        .run(usuario, str(d.nombre), correo, 'usuario', hash).lastInsertRowid;
    } catch (e) {
      if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'Ese usuario o correo ya existe.' });
      throw e;
    }
    startSession(res, id);
    res.status(201).json({ user: publicUser(getUserById.get(id)) });
  });

  /* POST /api/auth/login */
  router.post('/login', loginLimiter, async (req, res) => {
    const d = req.body || {};
    if (typeof d.usuario !== 'string' || typeof d.pass !== 'string') return res.status(400).json({ error: 'Escribe tu usuario y contraseña.' });
    const row = db.prepare('SELECT * FROM users WHERE usuario = ?').get(normUser(d.usuario));
    let ok = false;
    if (d.pass.length <= 128) {
      if (row) ok = await verifyPassword(d.pass, row.pass_hash);
      else await dummyVerify(d.pass);
    }
    if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    if (req.sessionToken) delSession.run(hashToken(req.sessionToken)); // rota la sesión anterior
    startSession(res, row.id);
    res.json({ user: publicUser(row) });
  });

  /* POST /api/auth/logout */
  router.post('/logout', (req, res) => {
    if (req.sessionToken) delSession.run(hashToken(req.sessionToken));
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return router;
};
