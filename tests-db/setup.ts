/**
 * Protege las pruebas de integración contra conexiones accidentales a bases reales.
 */
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("tests-db requiere DATABASE_URL explícita; no se permite un valor por defecto.");
}

let databaseHost: string;
try {
  databaseHost = new URL(databaseUrl).hostname;
} catch {
  throw new Error("DATABASE_URL no es una URL válida para tests-db.");
}

if (databaseHost !== "127.0.0.1" && databaseHost !== "localhost") {
  throw new Error("tests-db solo permite DATABASE_URL con host 127.0.0.1 o localhost.");
}
