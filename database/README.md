# Base de datos — ferreteria_backend

## Fuente de verdad (M1)

El historial `prisma/migrations` es la fuente de verdad. `database/init.sql` solo prepara extensiones, esquemas y permisos. `Squema.sql` del POS no debe montarse ni ejecutarse junto con Prisma en una base compartida.

## Instalación nueva (recomendado)

```bash
cd ferreteria_backend
cp .env.example .env
# Reemplace CAMBIAR_PASSWORD_LOCAL en POSTGRES_PASSWORD y DATABASE_URL por una contraseña local propia.
docker compose up -d
npm install
npm run db:migrate:deploy
npm run db:seed
```

Por defecto, el puerto de PostgreSQL se publica solo en `127.0.0.1`. Para publicarlo en otra interfaz, defina `POSTGRES_BIND` en `.env` antes de ejecutar `docker compose up -d`.

## Archivos en esta carpeta

| Archivo | Función |
|---|---|
| `init.sql` | Bootstrap del contenedor: `pgcrypto`, esquemas (`public`, `sales`, `dte`, `hr`, `system`, `purchasing`, `fiscal`), permisos |
| `README.md` | Esta guía |

## Legacy

`erp_ferreteria/Ferreteria.PuntoVenta/Squema.sql` y `erp_ferreteria/tools/Ferreteria.DbApply` quedan como referencia de compatibilidad del POS. **No** mezclar Squema.sql y Prisma sobre la misma BD sin backup, diff y revisión.

## Bases antiguas con INTEGER / BIGSERIAL

No hay migración automática de IDs enteros a UUID. Opciones:

| Opción | Cuándo |
|--------|--------|
| Recrear BD | Solo mediante una base desechable y el historial de migraciones |
| Exportar catálogo + reimportar | Pocos datos maestros |
| Script ETL manual | Producción con historial |

## Empleados demo (PIN caja — solo desarrollo)

| DUI | PIN | Rol |
|-----|-----|-----|
| 00000001-0 | 1234 | Admin / caja |
| 00000002-0 | 5678 | Técnico confección |
| 00000003-0 | 0000 | Caja demo |

Cambiar PINs antes de producción.
