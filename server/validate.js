'use strict';
/* Validaciones de entrada (el servidor nunca confía en lo que envía el navegador). */
const { GENEROS, PLATAFORMAS } = require('./seed');

const USER_RE = /^[a-z0-9_.-]{3,20}$/;
const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASS = 8, MAX_PASS = 128;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const normUser = (v) => str(v).toLowerCase();
const codePoints = (s) => Array.from(s).length;

function checkUser(d, { needPass = true } = {}) {
  if (!d || typeof d !== 'object') return 'Datos inválidos.';
  if (!USER_RE.test(normUser(d.usuario))) return 'El usuario debe tener de 3 a 20 caracteres (letras, números, . _ -).';
  const nombre = str(d.nombre);
  if (!nombre || nombre.length > 60) return 'Escribe el nombre (máximo 60 caracteres).';
  const correo = str(d.correo);
  if (!MAIL_RE.test(correo) || correo.length > 100) return 'Escribe un correo válido.';
  if (needPass) {
    const e = checkPass(d.pass);
    if (e) return e;
  }
  return '';
}

function checkPass(p) {
  if (typeof p !== 'string' || p.length < MIN_PASS) return `La contraseña debe tener al menos ${MIN_PASS} caracteres.`;
  if (p.length > MAX_PASS) return `La contraseña no puede pasar de ${MAX_PASS} caracteres.`;
  return '';
}

/* Producto: devuelve { error } o { value } ya normalizado.
   lenient=true (importación): genero/plataforma/emoji toman valores por defecto. */
function checkProduct(d, { lenient = false } = {}) {
  if (!d || typeof d !== 'object') return { error: 'Datos inválidos.' };
  const nombre = str(d.nombre);
  if (!nombre || nombre.length > 80) return { error: 'El nombre es obligatorio (máximo 80 caracteres).' };
  const genero = str(d.genero) || (lenient ? GENEROS[0] : '');
  const plataforma = str(d.plataforma) || (lenient ? PLATAFORMAS[0] : '');
  if (!genero || genero.length > 30) return { error: 'Indica el género (máximo 30 caracteres).' };
  if (!plataforma || plataforma.length > 30) return { error: 'Indica la plataforma (máximo 30 caracteres).' };
  const precio = typeof d.precio === 'string' ? parseFloat(d.precio) : d.precio;
  if (typeof precio !== 'number' || !Number.isFinite(precio) || precio < 0 || precio > 1000000) return { error: 'El precio debe ser un número entre 0 y 1,000,000.' };
  let descuento = d.descuento === undefined || d.descuento === null || d.descuento === '' ? 0 : (typeof d.descuento === 'string' ? parseFloat(d.descuento) : d.descuento);
  if (typeof descuento !== 'number' || !Number.isFinite(descuento) || descuento < 0 || descuento > 100) return { error: 'El descuento debe estar entre 0 y 100%.' };
  const descripcion = str(d.descripcion);
  if (descripcion.length > 300) return { error: 'La descripción no puede pasar de 300 caracteres.' };
  let emoji = str(d.emoji) || '🎮';
  if (codePoints(emoji) > 8) {
    if (!lenient) return { error: 'El emoji de portada es demasiado largo.' };
    emoji = '🎮';
  }
  return { value: { nombre, genero, plataforma, precio: Math.round(precio * 100) / 100, descuento: Math.round(descuento * 100) / 100, descripcion, emoji } };
}

module.exports = { USER_RE, MAIL_RE, MIN_PASS, str, normUser, checkUser, checkPass, checkProduct };
