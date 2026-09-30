# Acciones referenciales revisadas

`InventoryMovements.quantity` y `TotalCost` se almacenan como magnitudes positivas; `MovementType` determina si el movimiento es `ENTRADA` o `SALIDA`.

## Tablas agregadas por conteos físicos

- `public."InventoryCounts"`: cabecera del conteo, alcance, estado y auditoría de usuarios web.
- `public."InventoryCountLines"`: snapshot inicial, captura, diferencia y movimiento de ajuste por producto.

Las relaciones que ya existen en `Squema.sql` tienen `onDelete` y `onUpdate` explícitos en `prisma/schema.prisma`, tomados de la introspección de `BD_EXISTENTE`: `NoAction` por defecto y `Cascade` únicamente donde el SQL legacy lo declara.

La revisión de `src/modules/**` no encontró borrados de filas padre del POS que dependieran de `SET NULL`; los borrados observados son de detalles hijos o de datos propios de la tienda. No fue necesario cambiar la lógica de esos servicios.
