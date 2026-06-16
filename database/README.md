# Migraciones PostgreSQL — FlexoCable

## Orden de aplicación

1. `FlexoCable/FlexoCableSV.PuntoVenta/Squema.sql` (v2.0.0, UUID)
2. `20260616_0001_phase0_schema_saneamiento.sql`
3. `20260616_0002_phase0b_hr_payroll.sql`

Usar `FlexoCable/tools/FlexoCable.DbApply` o aplicar manualmente en ese orden.

## Instalación nueva (recomendado)

```bash
cd FlexoCable-backend
docker compose up -d
cd ../FlexoCable/tools/FlexoCable.DbApply
dotnet run
```

## Bases antiguas con INTEGER / BIGSERIAL

**No hay migración automática de datos** de IDs enteros a UUID. Opciones:

| Opción | Cuándo |
|--------|--------|
| Recrear BD vacía con `DbApply` | Desarrollo local, sin datos productivos |
| Exportar catálogo + reimportar | Pocos datos maestros |
| Script ETL manual | Producción con historial |

Si la BD fue creada con Squema.sql v1.x (enteros), **no ejecutar** solo las migraciones UUID: hay que recrear el esquema o contratar una migración de datos por tabla.

## Empleados demo (PIN caja)

| DUI | PIN | Rol |
|-----|-----|-----|
| 00000001-0 | 1234 | Admin / caja |
| 00000002-0 | 5678 | Técnico confección |
| 00000003-0 | 0000 | Caja demo |

Solo desarrollo. Cambiar PINs antes de producción.
