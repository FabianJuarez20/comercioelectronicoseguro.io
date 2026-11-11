'use strict';
const path = require('path');

/* Lee la configuración desde variables de entorno (ver .env.example).
   Se evalúa al crear la app, así las pruebas pueden sobreescribir valores. */
function loadConfig(over = {}) {
  const env = process.env.NODE_ENV || 'development';
  const prod = env === 'production';
  const cfg = {
    env,
    prod,
    port: Number(process.env.PORT) || 3000,
    dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'ludingo.db'),
    publicDir: path.join(__dirname, '..', 'public'),
    adminUser: (process.env.ADMIN_USER || 'admin').trim().toLowerCase(),
    adminPass: process.env.ADMIN_PASSWORD || '',
    sessionDays: Number(process.env.SESSION_DAYS) || 7,
    cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : prod,
    trustProxy: process.env.TRUST_PROXY === 'true' || prod, // detrás de Render/Railway/Nginx
    loginMax: Number(process.env.LOGIN_MAX) || 10,           // intentos fallidos / 15 min / IP
    registerMax: Number(process.env.REGISTER_MAX) || 20,     // registros / hora / IP
    orderMax: Number(process.env.ORDER_MAX) || 30,           // pedidos iniciados / 15 min / IP
    apiMax: Number(process.env.API_MAX) || 600,              // peticiones / minuto / IP
    log: process.env.LOG !== 'false',
    // PayPal (REST Orders v2). Las credenciales SOLO viven en el servidor.
    paypalEnv: process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox',
    paypalClientId: (process.env.PAYPAL_CLIENT_ID || '').trim(),
    paypalSecret: (process.env.PAYPAL_CLIENT_SECRET || '').trim(),
    currency: (process.env.PAYPAL_CURRENCY || 'MXN').trim().toUpperCase(),
  };
  return Object.assign(cfg, over);
}

module.exports = { loadConfig };
