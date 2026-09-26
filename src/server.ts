/**
 * Punto de entrada HTTP: carga variables de entorno y arranca el listener.
 */
import "dotenv/config";
import app from "./app.js";

const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`[ferreteria_backend] API escuchando en http://localhost:${port}`);
});
