# 🎮 Ludingo · Tienda de videojuegos en línea
Programación Web ISC 5-1 · Comercio electrónico seguro

Sitio web con **backend propio**: Node.js + Express + SQLite. El servidor sirve las páginas y la API desde el mismo origen, así que basta con arrancarlo y abrir el navegador.

## Inicio rápido
Requisitos: [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm start
```
Abre **http://localhost:3000**. En el primer arranque se crea la base de datos (`data/ludingo.db`), el catálogo inicial y una cuenta de administrador:

| Entorno | Usuario | Contraseña |
|---|---|---|
| Desarrollo (por defecto) | `admin` | `admin123` — cámbiala en Administrar → Usuarios |
| Producción (`NODE_ENV=production`) | `admin` | Se genera al azar y se imprime **una sola vez** en la consola (o usa `ADMIN_PASSWORD`) |

Pruebas automáticas: `npm test` (34 pruebas de la API: registro, login, permisos, catálogo, productos, seguridad y pagos).

## Estructura
```
├── server/
│   ├── index.js            Arranque (puerto, mensajes, cierre limpio)
│   ├── app.js              Express: seguridad, API y sitio estático
│   ├── config.js           Variables de entorno
│   ├── db.js               Esquema SQLite, catálogo inicial y admin del primer arranque
│   ├── seed.js             Productos iniciales, géneros y plataformas
│   ├── security.js         Hash de contraseñas (scrypt) y tokens de sesión
│   ├── validate.js         Validación de usuarios y productos
│   ├── middleware/auth.js  Sesión, roles y verificación de origen
│   ├── paypal.js           Cliente de PayPal (token, crear y capturar órdenes)
│   └── routes/             auth · users · products · orders · home
├── public/                 Sitio web (HTML, CSS y JS del navegador)
│   ├── index · catalogo · carrito · pedidos · admin · login · contacto (.html)
│   └── js/api.js           Cliente de la API (el resto de los scripts lo usa)
├── test/api.test.js        Pruebas automáticas
├── .env.example            Variables de configuración
└── package.json
```

## API
Todas las respuestas son JSON. Los errores tienen la forma `{ "error": "mensaje" }`.

| Método y ruta | Acceso | Descripción |
|---|---|---|
| `GET /api/home` | Público | Destacados (mayores descuentos), total de juegos, en promoción y conteo por género |
| `POST /api/auth/register` | Público | Crea cuenta (siempre rol `usuario`) e inicia sesión |
| `POST /api/auth/login` | Público | Inicia sesión |
| `POST /api/auth/logout` | Sesión | Cierra la sesión |
| `GET /api/auth/me` | Público | `{ user }` o `{ user: null }` |
| `GET /api/products?q=&genero=&plataforma=&ids=1,2` | Público | Catálogo con búsqueda (sin acentos ni mayúsculas) y filtros |
| `GET /api/products/meta` | Público | Géneros y plataformas disponibles |
| `GET /api/products/:id` | Público | Detalle de un producto |
| `POST /api/products` | **Admin** | Crea producto |
| `PUT /api/products/:id` | **Admin** | Edita producto |
| `DELETE /api/products/:id` | **Admin** | Elimina producto |
| `POST /api/products/import` | **Admin** | Reemplaza el catálogo con `{ "productos": [...] }` |
| `POST /api/products/reset` | **Admin** | Restaura el catálogo inicial |
| `GET /api/users` · `POST /api/users` | **Admin** | Lista y crea usuarios (con rol) |
| `PATCH /api/users/:usuario` | **Admin** | Cambia el rol `{ "rol": "admin" \| "usuario" }` |
| `PUT /api/users/:usuario/password` | **Admin** | Cambia la contraseña (cierra las demás sesiones de esa cuenta) |
| `DELETE /api/users/:usuario` | **Admin** | Elimina usuario |

Producto: `{ id, nombre, genero, plataforma, precio, descuento, precioFinal, descripcion, emoji }`. El **precio final se calcula en el servidor**: `precio × (100 − descuento) / 100`, redondeado a centavos; sin descuento se conserva el precio normal.

| `GET /api/orders/config` | Público | `{ enabled, clientId, currency, env }` para cargar el botón de PayPal |
| `POST /api/orders` | Sesión | `{ items:[{id,cant}], cliente, correo }` → crea el pedido y la orden de PayPal; devuelve `{ pedido, paypalOrderId }` |
| `POST /api/orders/:id/capture` | Sesión (dueño) | Cobra la orden aprobada y verifica monto y moneda; marca el pedido `pagado` |
| `GET /api/orders` | Sesión | Pedidos pagados del usuario (el administrador ve todos) |

## Pagos con PayPal
Flujo (PayPal Orders v2): el navegador manda solo `id` y `cantidad` de cada juego → el **servidor** calcula el total con los precios de la base de datos y crea la orden en PayPal → el comprador aprueba en la ventana de PayPal → el servidor **captura** el pago y comprueba que el monto y la moneda sean los del pedido antes de marcarlo `pagado`. El secreto de PayPal nunca llega al navegador.

Para probar con dinero ficticio (**sandbox**):
1. En https://developer.paypal.com → *Apps & Credentials* → pestaña **Sandbox** → *Create App*. Copia el **Client ID** y el **Secret**.
2. En `.env`: `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID=...`, `PAYPAL_CLIENT_SECRET=...` (moneda `MXN` por defecto). Arranca con `node --env-file=.env server/index.js`.
3. En *Testing Tools → Sandbox Accounts* usa la cuenta **Personal** (comprador) para pagar en la ventana de PayPal. La cuenta **Business** es la que recibe el dinero.
4. Para cobros reales: credenciales de la pestaña **Live** y `PAYPAL_ENV=live`.

## Roles
| Rol | Puede |
|---|---|
| Visitante | Ver inicio y catálogo, vista previa y llenar el carrito |
| **Usuario** | Lo anterior + finalizar compra y ver sus pedidos |
| **Administrador** | Lo anterior + sección Administrar (catálogo, usuarios y roles) y ver todos los pedidos |

Reglas: las cuentas nuevas siempre son `usuario`; solo un administrador crea administradores o cambia roles; siempre queda al menos un administrador y nadie puede eliminarse ni quitarse su propio rol de administrador. **Los permisos los valida el servidor** en cada petición; el menú y la redirección del navegador solo mejoran la experiencia.

## Seguridad implementada
- **Contraseñas** con `scrypt` y sal aleatoria (nunca en texto plano); mínimo 8 caracteres.
- **Sesiones** con token aleatorio en cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` en producción). En la base solo se guarda el SHA-256 del token; expiran a los 7 días y se rotan al iniciar sesión.
- **Fuerza bruta**: máximo 10 intentos fallidos de login cada 15 min por IP (HTTP 429); el mensaje de error es el mismo si el usuario no existe.
- **CSRF**: cookie `SameSite` + rechazo de peticiones que modifican datos con `Origin` de otro sitio.
- **Inyección SQL**: todas las consultas son parametrizadas.
- **XSS**: el navegador escapa todo lo que muestra y la política CSP (`script-src 'self'`) bloquea scripts ajenos.
- Cabeceras de `helmet` (CSP, HSTS en producción, `nosniff`, etc.), límite de 1 MB por petición y validación de todas las entradas en el servidor.

## Configuración
Copia `.env.example` y define las variables que necesites (con Node 20.6+: `node --env-file=.env server/index.js`). Las principales: `PORT`, `DB_PATH`, `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_DAYS`, `LOGIN_MAX`.

## Publicarlo en internet
GitHub Pages **no sirve** para este proyecto porque solo aloja archivos estáticos; hace falta un servicio que ejecute Node.js (Render, Railway, Fly.io, un VPS…).
1. Crea un servicio web desde tu repositorio de GitHub.
2. Build: `npm install` · Start: `npm start`.
3. Variables: `NODE_ENV=production` y `ADMIN_PASSWORD=<una contraseña fuerte>`.
4. SQLite guarda los datos en un archivo: monta un **disco persistente** y apunta `DB_PATH` a él (por ejemplo `/var/data/ludingo.db`). Sin disco persistente, los datos se pierden en cada despliegue.
5. Usa HTTPS (lo dan estos servicios); la cookie de sesión lo requiere en producción.

## Pendiente
- El **carrito** sigue en el `localStorage` del navegador (los pedidos y pagos ya viven en el servidor).
- Los pagos que PayPal deja en revisión (`pendiente`) no se actualizan solos; para eso haría falta un *webhook* (`PAYMENT.CAPTURE.COMPLETED`).
