# Ventas netas del dashboard

El endpoint `GET /api/v1/dashboard/summary` mantiene la autorización existente (`ADMIN`, `ACCOUNTANT` y `OWNER`) y expone el bloque `sales` con bruto, devoluciones y neto.

## Definiciones

- **Bruto:** suma de `sales."Orders".total` para órdenes con `status = 'COMPLETADA'`, usando `Orders."CreatedAt"`.
- **Devoluciones:** suma de `sales."Returns".total` para devoluciones con `status = 'COMPLETADA'` cuya orden original también tiene `status = 'COMPLETADA'`. Se atribuyen por `Returns."CreatedAt"`, no por la fecha de la venta. Las devoluciones `ANULADA` no restan.
- **Neto:** bruto menos devoluciones, redondeado a dos decimales. Puede ser negativo.
- **Líneas:** `topProducts` y `byCategory` usan `OrderDetails.subtotal` y `OrderDetails.quantity` para bruto, y `ReturnDetails.subtotal` y `ReturnDetails.quantity` para devoluciones. La cantidad devuelta usa la misma unidad comercial de la línea original.
- **Totales:** `today`, `week`, `month` y `prevMonth` son netos por compatibilidad; `gross`, `returns` y `net` muestran cada componente. `todayTx`, `weekTx` y `monthTx` siguen contando órdenes de venta completadas, sin restar devoluciones.

Todos los rangos se calculan en la zona horaria del negocio (`BUSINESS_TZ`, por defecto `America/El_Salvador`; ver [ZONA_HORARIA.md](ZONA_HORARIA.md)): hoy es el día local actual, semana son los últimos siete días incluyendo hoy, mes es el mes calendario actual y `prevMonth` es el mes calendario anterior completo. Las series diarias siempre contienen siete filas ascendentes, incluso sin actividad.

## Forma de respuesta

Ejemplo abreviado con los campos representativos del endpoint:

```json
{
  "sales": {
    "today": 85,
    "week": 165,
    "month": 115,
    "prevMonth": 100,
    "todayTx": 1,
    "weekTx": 2,
    "monthTx": 2,
    "gross": { "today": 100, "week": 180, "month": 180, "prevMonth": 120 },
    "returns": {
      "today": 15,
      "week": 15,
      "month": 65,
      "prevMonth": 20,
      "todayCount": 1,
      "weekCount": 1,
      "monthCount": 2,
      "prevMonthCount": 1
    },
    "net": { "today": 85, "week": 165, "month": 115, "prevMonth": 100 },
    "monthOverMonthPct": 15,
    "avgTicket": 57.5,
    "avgTicketGross": 90,
    "byOrderType": [
      { "orderType": "ORDEN_CONFECCION", "total": 80, "gross": 80, "returns": 0, "count": 1, "returnsCount": 0 }
    ],
    "topProducts": [
      {
        "productId": "uuid",
        "code": "P-001",
        "description": "Producto",
        "quantity": 2.5,
        "amount": 125,
        "grossQuantity": 3,
        "grossAmount": 140,
        "returnedQuantity": 0.5,
        "returnedAmount": 15
      }
    ],
    "daily": [
      { "date": "2031-03-09", "gross": 0, "returns": 0, "net": 0, "tx": 0, "returnsCount": 0 },
      { "date": "2031-03-10", "gross": 80, "returns": 0, "net": 80, "tx": 1, "returnsCount": 0 },
      { "date": "2031-03-11", "gross": 0, "returns": 0, "net": 0, "tx": 0, "returnsCount": 0 },
      { "date": "2031-03-12", "gross": 0, "returns": 0, "net": 0, "tx": 0, "returnsCount": 0 },
      { "date": "2031-03-13", "gross": 0, "returns": 0, "net": 0, "tx": 0, "returnsCount": 0 },
      { "date": "2031-03-14", "gross": 0, "returns": 0, "net": 0, "tx": 0, "returnsCount": 0 },
      { "date": "2031-03-15", "gross": 100, "returns": 15, "net": 85, "tx": 1, "returnsCount": 1 }
    ],
    "byCategory": [
      { "familyId": "uuid", "code": "FER", "name": "Ferretería", "gross": 140, "returns": 65, "net": 75 }
    ]
  }
}
```

La respuesta real contiene siete filas en `daily`. `byOrderType` y `topProducts` incluyen claves que solo aparecen en devoluciones; por eso pueden tener neto negativo. `byCategory` incluye únicamente familias con actividad bruta o devuelta en el mes.

## Qué no cambia

- Los libros de IVA del módulo fiscal siguen basándose en DTE. Las notas de crédito son DTE tipo 05 y no se modifican aquí.
- La vista POS `sales."VKpisToday"` continúa representando ventas brutas. No se altera porque hacerlo requeriría una migración y una decisión coordinada con el POS.
- La orden original conserva `status = 'COMPLETADA'` aunque la devolución sea total; la resta es explícita en el dashboard.

## Pendientes

- Revisar con el contador el tratamiento de notas de crédito DTE 05 en los libros de IVA.
