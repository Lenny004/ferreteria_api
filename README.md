# FlexoCable-backend

API Node.js para administración web (RRHH, planilla, inventario admin, reportes).

## Base de datos

- PostgreSQL con esquema UUID unificado (`Squema.sql` + migraciones en `database/migrations/`).
- Desarrollo local: `docker compose up -d` (puerto **55432**).
- Aplicar esquema: `dotnet run --project ../FlexoCable/tools/FlexoCable.DbApply`.

Ver [database/README.md](database/README.md) para orden de migraciones y empleados demo.

## Prisma

Esquema de referencia para el API (no usado por WPF):

```bash
cp .env.example .env
npm install
npx prisma generate
```

`DATABASE_URL` ejemplo: `postgresql://flexo_user:flexo_pass@localhost:55432/flexocable?schema=public`
