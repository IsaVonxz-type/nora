# Trama

> Plataforma multi organización para coordinar espacios, disponibilidad y reservas.

Trama ayuda a equipos que comparten espacios físicos a consultar disponibilidad, organizar reservas y seguir entregas, devoluciones y mantenimiento desde un solo lugar.

## Capacidades

- Consulta de disponibilidad por sede, fecha y horario.
- Calendario de reservas y gestión de recurrencias.
- Operación de entregas, devoluciones y bloqueos de mantenimiento.
- Analíticas de ocupación y demanda.
- Roles de administración, logística y consulta.
- Aislamiento multi organización con PostgreSQL Row Level Security.

## Stack

Node.js 24, Express 5, PostgreSQL, React 19, Vite, Vitest y Vercel.

## Requisitos

- Node.js 24.x
- pnpm 12.11.2
- PostgreSQL
- `JWT_SECRET` y `DATABASE_URL`

## Inicio local

```bash
pnpm install
pnpm --dir frontend install
cp .env.example .env
pnpm run dev
```

La API queda en `http://localhost:3000` y la interfaz en `http://localhost:5173`.
Configura un tenant existente como `DEFAULT_TENANT_SLUG` antes de iniciar sesión.

## Comandos

| Comando | Descripción |
|---|---|
| `pnpm run dev` | Inicia API e interfaz |
| `pnpm run test:backend` | Ejecuta pruebas backend |
| `pnpm --dir frontend test` | Ejecuta pruebas frontend |
| `pnpm run lint` | Ejecuta ESLint |
| `pnpm run build:frontend` | Compila la interfaz |
| `pnpm run db:migrate` | Aplica migraciones pendientes |

Para detalles de ejecución, configuración y seguridad consulta `docs/`.

## Estado

Proyecto en desarrollo. La creación de organizaciones y cuentas se aprovisiona por operación técnica; no hay registro público ni facturación.
