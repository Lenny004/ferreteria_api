# Acciones referenciales revisadas

## Devoluciones POS (`2_pos_devoluciones`)

| Tabla | FK | Cardinalidad | Acción |
|---|---|---|---|
| `sales."Returns"` | `OrderId` → `sales."Orders"` | una orden, muchas devoluciones | NO ACTION (no se puede borrar una orden con devoluciones) |
| `sales."Returns"` | `CashSessionId` → `sales."CashSessions"` (opcional) | una sesión, muchas devoluciones | NO ACTION |
| `sales."Returns"` | `EmployeeId` / `AuthorizedByEmployeeId` → `hr."Employees"` | ejecutor y autorizador obligatorios | NO ACTION |
| `sales."Returns"` | `CreditNoteDteId` → `dte."DteIssued"` (opcional) | una nota de crédito por devolución (único parcial `UqReturnsCreditNote`) | NO ACTION |
| `sales."ReturnDetails"` | `ReturnId` → `sales."Returns"` | una devolución, muchas líneas; una línea vendida por devolución (`UqReturnDetailsReturnLine`) | NO ACTION |
| `sales."ReturnDetails"` | `OrderDetailId` → `sales."OrderDetails"`, `ProductId` → `public."Products"` | muchas líneas devueltas por línea vendida (devoluciones parciales sucesivas) | NO ACTION |
| `sales."ReturnDetails"` | `InventoryMovementId` → `public."InventoryMovements"` (opcional) | un movimiento de reingreso por línea (`UqReturnDetailsMovement`) | NO ACTION |
| `sales."CashMovements"` | `CashSessionId` → `sales."CashSessions"` | una sesión, muchos movimientos | NO ACTION |
| `sales."CashMovements"` | `ReturnId` → `sales."Returns"` | obligatorio solo para `DEVOLUCION_EFECTIVO`; máximo uno por devolución (`UqCashMovementsReturnRefund`) | NO ACTION |
| `sales."CashMovements"` | `EmployeeId` / `AuthorizedByEmployeeId` (opcional) → `hr."Employees"` | | NO ACTION |

En Prisma, `creditNoteDte` e `inventoryMovement` se modelan como relaciones 1:N (sin `@unique`) porque Prisma no soporta índices únicos parciales; la unicidad cuando el valor no es NULL la garantizan los índices parciales en SQL.

La devolución no cambia la orden original: permanece `COMPLETADA`. El costo del reingreso usa el costo original de la venta, de forma provisional (a verificar con contador). No hay vales ni crédito en tienda. La regla de cantidad devuelta acumulada frente a lo vendido es responsabilidad del servicio del POS.

`InventoryMovements.quantity` y `TotalCost` se almacenan como magnitudes positivas; `MovementType` determina si el movimiento es `ENTRADA` o `SALIDA`.

Las alertas abiertas de `StockAlerts` siguen la regla `stock <= mínimo`, igual que el trigger `public.fn_stock_alert`.

## Tablas agregadas por conteos físicos

- `public."InventoryCounts"`: cabecera del conteo, alcance, estado y auditoría de usuarios web.
- `public."InventoryCountLines"`: snapshot inicial, captura, diferencia y movimiento de ajuste por producto.

Las relaciones que ya existen en `Squema.sql` tienen `onDelete` y `onUpdate` explícitos en `prisma/schema.prisma`, tomados de la introspección de `BD_EXISTENTE`: `NoAction` por defecto y `Cascade` únicamente donde el SQL legacy lo declara.

La revisión de `src/modules/**` no encontró borrados de filas padre del POS que dependieran de `SET NULL`; los borrados observados son de detalles hijos o de datos propios de la tienda. No fue necesario cambiar la lógica de esos servicios.
