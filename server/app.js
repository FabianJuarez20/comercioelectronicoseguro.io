'use strict';
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { loadConfig } = require('./config');
const { openDb, seedProductsIfEmpty, ensureAdmin } = require('./db');
const { loadUser, sameOrigin } = require('./middleware/auth');

async function createApp(over = {}) {
  const cfg = loadConfig(over);
  const db = openDb(cfg.dbPath);
  seedProductsIfEmpty(db);
  const adminInfo = await ensureAdmin(db, cfg);
  const ctx = { db, cfg };

  const app = express();
  app.disable('x-powered-by');
  if (cfg.trustProxy) app.set('trust proxy', 1);

  // PayPal carga su botón (script + iframes) desde sus propios dominios; sandbox y live usan los mismos.
  const PP = ['https://*.paypal.com', 'https://*.paypalobjects.com'];
  app.use(helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // necesario para la ventana emergente de PayPal
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...PP],
        styleSrc: ["'self'", "'unsafe-inline'"], // el front usa style="" en las portadas
        imgSrc: ["'self'", 'data:', ...PP],
        connectSrc: ["'self'", ...PP],
        frameSrc: ["'self'", ...PP],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  }));

  if (cfg.log) {
    app.use((req, res, next) => {
      const t = Date.now();
      res.on('finish', () => { if (req.path.startsWith('/api')) console.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - t}ms`); });
      next();
    });
  }

  /* ---------- API ---------- */
  const api = express.Router();
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use(rateLimit({ windowMs: 60 * 1000, limit: cfg.apiMax, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiadas peticiones. Espera un momento.' } }));
  api.use(express.json({ limit: '1mb' }));
  api.use(cookieParser());
  api.use(sameOrigin);
  api.use(loadUser(db));

  api.get('/health', (req, res) => res.json({ ok: true }));
  api.use('/auth', require('./routes/auth')(ctx));
  api.use('/users', require('./routes/users')(ctx));
  api.use('/products', require('./routes/products')(ctx));
  api.use('/orders', require('./routes/orders')(ctx));
  api.use('/home', require('./routes/home')(ctx));
  api.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  app.use('/api', api);

  /* ---------- Sitio web (frontend estático) ---------- */
  app.use(express.static(cfg.publicDir, { index: 'index.html', dotfiles: 'ignore', maxAge: cfg.prod ? '1h' : 0 }));
  app.use((req, res) => res.status(404).type('html').send('<!DOCTYPE html><meta charset="utf-8"><title>No encontrada · Ludingo</title><p style="font-family:sans-serif">Página no encontrada. <a href="/">Volver al inicio</a></p>'));

  /* ---------- Errores ---------- */
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La petición es demasiado grande.' });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  return { app, db, cfg, adminInfo, close: () => db.close() };
}

module.exports = { createApp };
