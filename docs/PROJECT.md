# Trama: guía técnica

Trama es una aplicación multi organización para coordinar espacios físicos, reservas, disponibilidad, operación y analíticas.

## Arquitectura

- `backend/app.js`: aplicación Express sin `listen()`.
- `backend/dev-server.js`: servidor local y validación de entorno.
- `frontend/src/main.jsx`: entrada de React.
- `frontend/src/app/AppRouter.jsx`: rutas y control de acceso de interfaz.
- `backend/src/routes/index.js`: montaje de rutas API.
- `database/schema.sql` y `database/migrations/`: esquema y evolución de PostgreSQL.

Los handlers de `api/` delegan en `backend/app.js`. Los cambios de API deben hacerse en los controladores y servicios backend, no en los wrappers serverless.

## Tenancy y autorización

Cada organización mantiene membresías y roles por persona. Las comprobaciones backend usan la sesión verificada; el nombre o slug de la URL solo selecciona organización y nunca concede autorización. El aislamiento de datos se aplica con Row Level Security y `app.tenant_id` local a cada transacción.

Usa `backend/db/connection.js` para consultas. El trabajo fuera de una petición debe ejecutar `runWithTenant`. Consulta [TENANCY.md](TENANCY.md) y [ORGANIZATION_DOMAINS.md](ORGANIZATION_DOMAINS.md).

## Desarrollo y validación

Los comandos se documentan en el README. Las pruebas unitarias no necesitan una base de datos externa; las pruebas de integración requieren un PostgreSQL descartable configurado explícitamente.

## Despliegue

Vercel compila la SPA y enruta `/api/*` a Express. El build no aplica SQL. Aplica migraciones en la base destino antes de desplegar código que dependa de ellas y usa credenciales runtime sin `SUPERUSER` ni `BYPASSRLS`.
