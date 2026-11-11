'use strict';
const { hashToken } = require('../security');

const COOKIE = 'ludingo_sid';

const publicUser = (u) => ({ usuario: u.usuario, nombre: u.nombre, correo: u.correo, rol: u.rol, creado: u.creado });

/* Lee la cookie de sesión y deja el usuario (con su rol ACTUAL en la base) en req.user. */
function loadUser(db) {
  const q = db.prepare(`SELECT u.id, u.usuario, u.nombre, u.correo, u.rol, u.creado
                        FROM sessions s JOIN users u ON u.id = s.user_id
                        WHERE s.token_hash = ? AND s.expira > ?`);
  return (req, res, next) => {
    req.user = null;
    req.sessionToken = null;
    const t = req.cookies && req.cookies[COOKIE];
    if (typeof t === 'string' && t.length >= 20 && t.length <= 100) {
      req.user = q.get(hashToken(t), Date.now()) || null;
      if (req.user) req.sessionToken = t;
    }
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo un administrador puede hacer esto.' });
  next();
}

/* Defensa extra contra CSRF: las peticiones que modifican datos deben venir de este mismo origen. */
function sameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) { /* origen inválido */ }
    if (host !== req.get('host')) return res.status(403).json({ error: 'Origen no permitido.' });
  }
  next();
}

module.exports = { COOKIE, publicUser, loadUser, requireAuth, requireAdmin, sameOrigin };
