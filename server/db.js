'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { PRODUCTOS } = require('./seed');
const { hashPassword, randomPassword } = require('./security');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario   TEXT NOT NULL UNIQUE,
  nombre    TEXT NOT NULL,
  correo    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  rol       TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('admin','usuario')),
  pass_hash TEXT NOT NULL,
  creado    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expira     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre      TEXT NOT NULL,
  genero      TEXT NOT NULL,
  plataforma  TEXT NOT NULL,
  precio_cent INTEGER NOT NULL CHECK (precio_cent >= 0),
  descuento   REAL NOT NULL DEFAULT 0 CHECK (descuento >= 0 AND descuento <= 100),
  descripcion TEXT NOT NULL DEFAULT '',
  emoji       TEXT NOT NULL DEFAULT '🎮'
);
CREATE TABLE IF NOT EXISTS orders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  usuario           TEXT NOT NULL,
  cliente           TEXT NOT NULL,
  correo            TEXT NOT NULL,
  estado            TEXT NOT NULL DEFAULT 'creado' CHECK (estado IN ('creado','pendiente','pagado')),
  total_cent        INTEGER NOT NULL CHECK (total_cent > 0),
  moneda            TEXT NOT NULL,
  paypal_order_id   TEXT UNIQUE,
  paypal_capture_id TEXT,
  creado            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  pagado_en         TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE TABLE IF NOT EXISTS order_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id          INTEGER,
  nombre              TEXT NOT NULL,
  cant                INTEGER NOT NULL CHECK (cant > 0),
  precio_original_cent INTEGER NOT NULL,
  descuento           REAL NOT NULL DEFAULT 0,
  precio_cent         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
`;

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

const INSERT_PRODUCT = `INSERT INTO products (nombre,genero,plataforma,precio_cent,descuento,descripcion,emoji)
                        VALUES (@nombre,@genero,@plataforma,@precio_cent,@descuento,@descripcion,@emoji)`;

const toRow = (p) => ({ ...p, precio_cent: Math.round(p.precio * 100) });

/* Reemplaza todo el catálogo (transacción) y reinicia los ids. */
function replaceProducts(db, list) {
  const ins = db.prepare(INSERT_PRODUCT);
  db.transaction(() => {
    db.prepare('DELETE FROM products').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name='products'").run();
    for (const p of list) ins.run(toRow(p));
  })();
}

function seedProductsIfEmpty(db) {
  if (db.prepare('SELECT COUNT(*) n FROM products').get().n === 0) replaceProducts(db, PRODUCTOS);
}

/* Primer arranque: crea la cuenta de administrador si no hay usuarios. */
async function ensureAdmin(db, cfg) {
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n > 0) return null;
  let pass = cfg.adminPass, generated = false;
  if (!pass) {
    if (cfg.prod) { pass = randomPassword(); generated = true; }
    else pass = 'admin123'; // solo para desarrollo local
  }
  db.prepare('INSERT INTO users (usuario,nombre,correo,rol,pass_hash) VALUES (?,?,?,?,?)')
    .run(cfg.adminUser, 'Administrador', `${cfg.adminUser}@ludingo.local`, 'admin', await hashPassword(pass));
  return { usuario: cfg.adminUser, pass, generated, dev: !cfg.prod && !cfg.adminPass };
}

module.exports = { openDb, replaceProducts, seedProductsIfEmpty, ensureAdmin };
