import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middleware/error-handler.js";
import authRoutes from "./modules/auth/auth.routes.js";
import employeesRoutes from "./modules/employees/employees.routes.js";
import banksRoutes from "./modules/banks/banks.routes.js";
import documentTypesRoutes from "./modules/document-types/document-types.routes.js";
import {
  departmentsRouter,
  positionsRouter,
} from "./modules/catalogs/catalogs.routes.js";
import customersRoutes from "./modules/customers/customers.routes.js";
import productsRoutes from "./modules/products/products.routes.js";
import inventoryRoutes from "./modules/inventory/inventory.routes.js";

function resolveCorsOrigins(): string[] {
  const configured = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV === "production") {
    return configured;
  }

  return Array.from(
    new Set([
      ...configured,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]),
  );
}

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: resolveCorsOrigins(),
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/employees", employeesRoutes);
app.use("/api/v1/banks", banksRoutes);
app.use("/api/v1/document-types", documentTypesRoutes);
app.use("/api/v1/departments", departmentsRouter);
app.use("/api/v1/positions", positionsRouter);
app.use("/api/v1/customers", customersRoutes);
app.use("/api/v1/products", productsRoutes);
app.use("/api/v1/inventory", inventoryRoutes);

app.use(errorHandler);

export default app;
