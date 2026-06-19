# Base de datos — FlexoCable-backend

## Fuente de verdad (v3.0)

Desde el plan v3.0, el esquema se define en **`prisma/schema.prisma`**. Las tablas se crean con Prisma; `database/init.sql` solo prepara extensiones y esquemas al iniciar Docker.

## Instalación nueva (recomendado)

```bash
cd FlexoCable-backend
docker compose up -d
cp .env.example .env
npm install
npm run db:push
npm run db:seed
```

## Archivos en esta carpeta

| Archivo | Función |
|---|---|
| `init.sql` | Bootstrap del contenedor: `pgcrypto`, esquemas (`public`, `sales`, `dte`, `hr`, `system`, `purchasing`, `fiscal`), permisos |
| `README.md` | Esta guía |

## Legacy

`FlexoCable/FlexoCableSV.PuntoVenta/Squema.sql` y `FlexoCable/tools/FlexoCable.DbApply` quedan como referencia histórica. **No** mezclar Squema.sql y Prisma sobre la misma BD sin coordinación.

## Bases antiguas con INTEGER / BIGSERIAL

No hay migración automática de IDs enteros a UUID. Opciones:

| Opción | Cuándo |
|--------|--------|
| Recrear BD con `npm run db:push` + `db:seed` | Desarrollo local sin datos productivos |
| Exportar catálogo + reimportar | Pocos datos maestros |
| Script ETL manual | Producción con historial |

## Empleados demo (PIN caja — solo desarrollo)

| DUI | PIN | Rol |
|-----|-----|-----|
| 00000001-0 | 1234 | Admin / caja |
| 00000002-0 | 5678 | Técnico confección |
| 00000003-0 | 0000 | Caja demo |

Cambiar PINs antes de producción.
