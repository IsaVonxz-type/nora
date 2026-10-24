![Nora: espacios en su momento](frontend/public/img/nora-banner.png)

# Nora

**Espacios en su momento.** Una aplicación para consultar disponibilidad, organizar reservas y coordinar la operación de espacios compartidos.

Nora funciona como **una sola instalación**: todas las sedes y usuarios pertenecen al mismo sistema. No incluye selección de instituciones, dominios por organización, membresías ni aislamiento multi-tenant.

## Qué incluye

- Sedes y horarios semanales.
- Espacios con capacidad, dotación, ubicación y estado.
- Disponibilidad por sede, fecha y horario.
- Calendario y reservas, incluidas recurrencias y reprogramación.
- Entregas, devoluciones, mantenimiento e historial de cambios.
- Analíticas de ocupación y exportación CSV.
- Usuarios con roles y autenticación mediante cookies HttpOnly.

| Rol | Uso principal |
|---|---|
| `Admin` | Usuarios, sedes, espacios, reservas, operación y analíticas |
| `Logistica` | Espacios, reservas y operación; consulta de calendario y disponibilidad |
| `Instructor` | Consulta de dashboard, calendario y disponibilidad |

Los nombres de rol anteriores son los valores actuales de la API y la base de datos. Las comprobaciones backend son la autoridad para cada acción; ver una página no concede permisos.

## Requisitos

- Node.js **24.x**.
- pnpm **12.11.2**, fijado en ambos `package.json`.
- PostgreSQL y una base independiente para Nora.
- Un cliente SQL, como `psql`, para preparar la base y crear el primer administrador.

Stack: Express 5, PostgreSQL, React 19, Vite, TanStack Query y Vitest. Backend y frontend son paquetes independientes, no un workspace.

## Inicialización

### 1. Instalar dependencias

Desde la carpeta raíz del proyecto:

```sh
pnpm install --frozen-lockfile
pnpm --dir frontend install --frozen-lockfile
```

No mezcles npm o yarn con los lockfiles de pnpm.

### 2. Configurar entorno

Copia `.env.example` a `.env`. En PowerShell:

```powershell
Copy-Item .env.example .env
```

Completa estos valores sin subir el archivo a Git:

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión a la base PostgreSQL de Nora |
| `JWT_SECRET` | Secreto aleatorio de al menos 32 caracteres |
| `PORT` | Puerto de API, predeterminado `3000` |
| `CORS_ORIGIN` | Origen exacto de la interfaz si necesitas sobrescribirlo |
| `ENABLE_COMPRESSION` | Sobrescritura opcional con `true` o `false` |

Genera un secreto nuevo para cada entorno y guárdalo en `.env` o en el gestor de secretos del despliegue:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Ejemplo de conexión local, reemplazando las credenciales:

```text
postgresql://USER:PASSWORD@localhost:5432/nora_local?sslmode=disable
```

En producción usa TLS con verificación de certificado, por ejemplo `sslmode=verify-full`. El backend rechaza `sslmode=disable` en producción.

El frontend usa `/api` por defecto. `frontend/.env.example` documenta `VITE_API_BASE_URL` para una API separada; en desarrollo normal no hace falta configurarlo.

### 3. Preparar una base nueva

Crea una base vacía exclusiva para Nora y configura su URL. Revisa el destino antes de ejecutar:

```sh
pnpm run db:migrate
```

El runner aplica `database/migrations/0000` a `0006` y registra sus checksums en `schema_migrations`. `database/schema.sql` es la referencia consolidada; no necesitas ejecutarlo además de las migraciones para una instalación nueva.

**No conectes esta versión directamente a una base que ya recibió la migración multi-tenant `0007`.** Retirar el código no revierte columnas, políticas RLS ni datos de una base existente. Usa una base nueva; cualquier traslado de datos requiere respaldo y una conversión revisada por separado. No hay rollback destructivo automático.

### 4. Crear el primer administrador

No hay registro público ni una cuenta con contraseña predeterminada. El primer administrador se crea por operación técnica.

Define temporalmente `ADMIN_PASSWORD` en el entorno de tu terminal usando un método seguro. Usa una contraseña única de al menos 10 caracteres con mayúscula, minúscula, número y símbolo. No la guardes en el repositorio ni la escribas en un comando que quede en el historial.

Genera el hash bcrypt con coste 12:

```sh
node --input-type=module -e "import bcrypt from 'bcryptjs'; if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD requerida'); console.log(await bcrypt.hash(process.env.ADMIN_PASSWORD, 12));"
```

En tu cliente SQL, conectado a la base de Nora, ejecuta el siguiente INSERT reemplazando nombre, correo y hash. Usa parámetros de tu cliente SQL si están disponibles; nunca guardes contraseñas sin hash:

```sql
INSERT INTO usuarios (nombre, email, contraseña, rol)
VALUES ('Administración', 'admin@example.test', 'REEMPLAZAR_CON_HASH_BCRYPT', 'Admin');
```

Elimina `ADMIN_PASSWORD` del entorno de la terminal después. Inicia sesión con el correo y la contraseña originales, no con el hash. Luego crea el resto de cuentas desde **Usuarios**.

### 5. Iniciar desarrollo

```sh
pnpm run dev
```

- Interfaz: `http://localhost:5173`.
- API: `http://localhost:3000/api`.
- Vite reenvía `/api` al backend local.
- Landing: `/`; acceso: `/login`.

Después del primer acceso, crea sedes, configura sus horarios semanales y agrega espacios. Los horarios iniciales están cerrados: configura días y horas reales antes de reservar o interpretar ocupación.

## Comandos

| Comando | Descripción |
|---|---|
| `pnpm run dev` | API e interfaz en desarrollo |
| `pnpm run dev:backend` | Solo API |
| `pnpm run dev:frontend` | Solo interfaz |
| `pnpm run db:migrate` | Aplica migraciones pendientes |
| `pnpm run test:backend` | Pruebas unitarias backend sin base externa |
| `pnpm --dir frontend test` | Pruebas de interfaz |
| `pnpm run lint` | ESLint |
| `pnpm run audit:dependencies` | Auditoría de dependencias de producción |
| `pnpm run build:frontend` | Compila SPA en `frontend/dist` |
| `pnpm start` | Sirve API y SPA compilada |
| `pnpm run test:smoke` | Arranca servidor y comprueba endpoints básicos |
| `pnpm run test:integration` | Integración contra PostgreSQL descartable de CI |

`test:smoke` requiere `.env` válido y un build previo. Integración se omite sin `TEST_DATABASE_URL`; sus guardas solo permiten una base descartable de CI, con usuario y base `ambientes_ci`, host loopback y opt-in explícito. Nunca uses producción para estas pruebas. La configuración está en `.github/workflows/ci.yml`.

## Datos de ejemplo locales

El seed opcional `pnpm run db:seed:demo` está restringido a PostgreSQL loopback y a la base **`ambientes_local`**. No funciona sobre `nora_local` ni sobre bases remotas por diseño.

Si necesitas este dataset, prepara una base vacía llamada `ambientes_local`, aplica las migraciones y crea una cuenta activa `demo.admin@ambientes.local` con rol `Admin` siguiendo el procedimiento anterior. Define `LOCAL_DEMO_DATABASE_URL` en el entorno de la terminal y ejecuta el seed. Para iniciar la aplicación sobre esos datos, apunta también `DATABASE_URL` a esa base.

El seed crea sedes, espacios, reservas y mantenimiento de ejemplo. Al repetirlo actualiza los espacios y horarios demo; no debe ejecutarse sobre información que quieras conservar sin cambios.

## Despliegue

Para servir con Node:

```sh
pnpm run build:frontend
pnpm start
```

Configura `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` y el origen HTTPS de la interfaz. Sin `frontend/dist/index.html`, las rutas no API devuelven `503`.

`vercel.json` configura instalación, build, salida SPA, API y cabeceras de seguridad. El despliegue **no aplica SQL**: prepara la base antes de publicar. Cada instalación debe tener sus propias credenciales y datos; Nora no comparte varias organizaciones dentro de una misma base.

## Estructura

```text
api/                 Entrada serverless de Express
backend/             API, modelos, servicios y pruebas
database/            Esquema y migraciones
frontend/            Aplicación React y assets de Nora
scripts/             Migraciones, seed local y smoke tests
docs/                Arquitectura y convenciones frontend
```

Más información: [guía técnica](docs/PROJECT.md), [estilos frontend](docs/FRONTEND_STYLES.md) e [identidad visual](BRAND.md).

## Estado y licencia

Proyecto en desarrollo. No incluye registro público, facturación ni recuperación de contraseña por correo. La administración gestiona cuentas y restablecimientos desde la aplicación. Licencia [MIT](LICENSE).
