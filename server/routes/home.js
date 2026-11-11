'use strict';
const express = require('express');
const { toApi } = require('./products');

/* GET /api/home → datos de la página principal: destacados (mayores descuentos) y estadísticas */
module.exports = function homeRoutes({ db }) {
  const router = express.Router();
  router.get('/', (req, res) => {
    const destacados = db.prepare('SELECT * FROM products ORDER BY descuento DESC, id ASC LIMIT 4').all().map(toApi);
    const total = db.prepare('SELECT COUNT(*) n FROM products').get().n;
    const enPromocion = db.prepare('SELECT COUNT(*) n FROM products WHERE descuento > 0').get().n;
    const generos = db.prepare('SELECT genero, COUNT(*) cantidad FROM products GROUP BY genero ORDER BY cantidad DESC, genero').all();
    res.json({ destacados, total, enPromocion, generos });
  });
  return router;
};
