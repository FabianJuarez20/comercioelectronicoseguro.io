'use strict';
const { createApp } = require('./app');
const { loadConfig } = require('./config');

(async () => {
  const cfg = loadConfig();
  const { app, db, adminInfo } = await createApp(cfg);
  const server = app.listen(cfg.port, () => {
    console.log(`\n🎮 Ludingo listo en http://localhost:${cfg.port}  (${cfg.env})`);
    console.log(`   Base de datos: ${cfg.dbPath}`);
    if (adminInfo) {
      if (adminInfo.generated) {
        console.log(`\n   ⚠️  Cuenta de administrador creada. Guarda esta contraseña, no se mostrará otra vez:`);
        console.log(`      usuario: ${adminInfo.usuario}   contraseña: ${adminInfo.pass}\n`);
      } else if (adminInfo.dev) {
        console.log(`\n   ⚠️  Cuenta de administrador de desarrollo: usuario "${adminInfo.usuario}", contraseña "admin123".`);
        console.log('      Cámbiala desde Administrar → Usuarios, o define ADMIN_PASSWORD antes del primer arranque.\n');
      } else {
        console.log(`   Cuenta de administrador "${adminInfo.usuario}" creada con ADMIN_PASSWORD.`);
      }
    }
  });
  const stop = () => server.close(() => { db.close(); process.exit(0); });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((e) => { console.error('No se pudo iniciar el servidor:', e); process.exit(1); });
