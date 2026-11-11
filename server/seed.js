'use strict';
/* Catálogo inicial (precio en pesos MXN, descuento en %). */
const GENEROS = ['Acción', 'Aventura', 'RPG', 'Estrategia', 'Deportes', 'Shooter', 'Carreras', 'Puzzle'];
const PLATAFORMAS = ['PC', 'PlayStation', 'Xbox', 'Nintendo Switch', 'Móvil'];

const PRODUCTOS = [
  { nombre: 'Cyber Arena Online', genero: 'Shooter', plataforma: 'PC', precio: 499, descuento: 20, descripcion: 'Shooter competitivo en línea con partidas por equipos y arenas futuristas.', emoji: '🔫' },
  { nombre: 'Reinos de Eldoria', genero: 'RPG', plataforma: 'PC', precio: 699, descuento: 0, descripcion: 'RPG de mundo abierto: forma tu héroe, explora reinos y enfrenta dragones.', emoji: '🐉' },
  { nombre: 'Turbo Drift League', genero: 'Carreras', plataforma: 'PlayStation', precio: 599, descuento: 15, descripcion: 'Carreras de derrape con autos personalizables y ligas en línea.', emoji: '🏎️' },
  { nombre: 'Galaxy Commanders', genero: 'Estrategia', plataforma: 'PC', precio: 349, descuento: 0, descripcion: 'Estrategia espacial: dirige flotas, administra recursos y conquista galaxias.', emoji: '🚀' },
  { nombre: 'Pro Soccer Online', genero: 'Deportes', plataforma: 'Xbox', precio: 799, descuento: 30, descripcion: 'Fútbol en línea con ligas, equipos reales y partidos multijugador.', emoji: '⚽' },
  { nombre: 'Isla Perdida', genero: 'Aventura', plataforma: 'Nintendo Switch', precio: 549, descuento: 0, descripcion: 'Aventura de exploración en una isla misteriosa llena de secretos.', emoji: '🏝️' },
  { nombre: 'Pixel Blocks Duel', genero: 'Puzzle', plataforma: 'Móvil', precio: 99, descuento: 0, descripcion: 'Puzzle rápido para móvil: duelos de bloques contra jugadores de todo el mundo.', emoji: '🧩' },
  { nombre: 'Shadow Ninjas', genero: 'Acción', plataforma: 'PlayStation', precio: 649, descuento: 10, descripcion: 'Acción y sigilo: ninjas, combos veloces y misiones en las sombras.', emoji: '🥷' },
];

module.exports = { GENEROS, PLATAFORMAS, PRODUCTOS };
