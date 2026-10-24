# Aislamiento multi organización

## Modelo

Un tenant representa una organización. Las sedes pertenecen a una organización. Las identidades son globales y los roles, estados y versiones de sesión viven en `tenant_memberships`.

El tenant predeterminado se configura mediante `DEFAULT_TENANT_SLUG` y usa `default` en el esquema de referencia. El slug selecciona contexto, pero no demuestra autorización.

## Acceso y sesiones

- Las rutas autenticadas requieren una sesión firmada y membresía activa en el tenant solicitado.
- Los roles por membresía autorizan acciones; no se debe usar un rol global para conceder acceso.
- Las sesiones antiguas sin tenant claim solo pueden resolverse en el tenant predeterminado.
- Los cambios de membresía y credenciales revocan sesiones según las versiones de sesión.

## Aislamiento de datos

PostgreSQL Row Level Security se fuerza en tablas operativas. Cada petición configura `app.tenant_id` en la transacción. Usa siempre `backend/db/connection.js`; procesos en segundo plano deben ejecutar `runWithTenant`.

El rol runtime debe ser `NOSUPERUSER NOBYPASSRLS`. Usa credenciales administrativas separadas para migraciones.

## Despliegue de migraciones

La migración `0007` crea el tenant predeterminado, copia identidades y roles existentes y asigna sus registros operativos antes de activar restricciones y RLS. En instalaciones existentes, valida respaldo, ventana de mantenimiento y duración en staging. Despliega backend y migración coordinadamente; no hagas rollout desatendido entre versiones incompatibles.

La creación de organizaciones y sus administradores es operación técnica. No hay registro público, selector general, reclamo automático de dominios ni facturación.
