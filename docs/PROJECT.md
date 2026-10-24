# Nora: guía técnica

Nora coordina espacios, sedes, reservas, disponibilidad y operación en una sola instalación. Cada usuario tiene su rol en `usuarios`; no hay membresías ni selección de organización.

## Entradas y capas

- `backend/app.js`: Express sin `listen()`; usado por tests y serverless.
- `backend/dev-server.js`: carga `.env` e inicia desarrollo.
- `frontend/src/main.jsx`: arranca React, router, consultas, SEO y notificaciones.
- `frontend/src/app/AppRouter.jsx`: rutas y guardas de interfaz.
- `frontend/src/pages/DemoEntry.jsx`: inicio público del sandbox sin base de datos.
- `frontend/src/services/demoApi.js`: datos sintéticos en memoria y adaptador HTTP de la demo.
- `backend/src/routes/index.js`: rutas de API.
- `backend/src/controllers`, `services` y `models`: HTTP, negocio y SQL.
- `backend/db/connection.js`: pool PostgreSQL y consultas.

Los wrappers `api/` delegan a Express. Cambia handlers backend, no wrappers, para modificar la API.

## Seguridad y datos

El JWT viaja en cookie HttpOnly. La versión de sesión en el usuario permite revocación tras cambios de rol, estado o contraseña. Las rutas backend verifican permisos aunque la interfaz también oculte acciones. CORS y CSRF validan orígenes exactos.

`/demo` inicia un perfil Admin temporal. `httpClient` selecciona el adaptador en memoria mientras la marca de sesión existe en `sessionStorage`; no hace solicitudes de red. Preferencias de la demo tampoco se guardan en `localStorage`. Los datos vuelven a sus valores sintéticos iniciales al recargar o terminar la sesión.

Crear reservas mantiene una transacción con bloqueo `SELECT ... FOR UPDATE` para evitar solapamientos concurrentes. El historial registra creación, reprogramación, cancelación, entrega y devolución.

## Base de datos

`database/schema.sql` contiene el esquema consolidado. Las migraciones `0000` a `0006` preparan una base nueva. Esta versión no convierte bases con el esquema multi-tenant anterior; usa una base independiente y revisa cualquier importación de datos.

No se ejecutan migraciones durante el build. Consulta [README](../README.md) para instalación, primer administrador, configuración, pruebas y despliegue.
