'use strict';
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

/* Contraseñas: scrypt (incluido en Node) con sal aleatoria. Formato: scrypt$sal$hash */
const KEYLEN = 64;

async function hashPassword(pass) {
  const salt = crypto.randomBytes(16);
  const dk = await scrypt(String(pass), salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${dk.toString('hex')}`;
}

async function verifyPassword(pass, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const dk = await scrypt(String(pass), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(dk, expected);
}

/* Hash falso para que "usuario inexistente" tarde lo mismo que "contraseña incorrecta" */
let dummy;
async function dummyVerify(pass) {
  if (!dummy) dummy = await hashPassword(crypto.randomBytes(8).toString('hex'));
  await verifyPassword(pass, dummy);
}

/* Sesiones: el token va en la cookie; en la base solo se guarda su SHA-256. */
const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const randomPassword = () => crypto.randomBytes(9).toString('base64url');

module.exports = { hashPassword, verifyPassword, dummyVerify, newToken, hashToken, randomPassword };
