import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  INCOMING_MOVEMENT_TYPES,
  OUTGOING_MOVEMENT_TYPES,
  movementDirection,
  movementMagnitude,
  signedMovementDelta,
} from "../src/modules/inventory/movement-direction.js";

describe("dirección de movimientos de inventario", () => {
  it("clasifica entradas y salidas por tipo", () => {
    for (const type of INCOMING_MOVEMENT_TYPES) expect(movementDirection(type)).toBe("ENTRADA");
    for (const type of OUTGOING_MOVEMENT_TYPES) expect(movementDirection(type)).toBe("SALIDA");
  });

  it("rechaza tipos que no existen en MovementTypeValid", () => {
    expect(() => movementDirection("VENTA")).toThrow(/inválido/);
  });

  it("obtiene la magnitud de negativos y decimales", () => {
    expect(movementMagnitude("-3.125").toString()).toBe("3.125");
    expect(movementMagnitude(new Prisma.Decimal("-2.50")).toString()).toBe("2.5");
  });

  it("aplica el signo únicamente al delta de stock", () => {
    expect(signedMovementDelta("ENTRADA_COMPRA", "2.50").toString()).toBe("2.5");
    expect(signedMovementDelta("AJUSTE_SALIDA", "-2.50").toString()).toBe("-2.5");
  });
});
