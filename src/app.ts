/**
 * Aplicación Express: middlewares globales, montaje de rutas y error handler final.
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import { loadEnv } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { rateLimit } from "express-rate-limit";
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
import {
  suppliersRouter,
  purchaseOrdersRouter,
} from "./modules/purchasing/purchasing.routes.js";
import payrollPeriodsRoutes from "./modules/payroll-periods/payroll-periods.routes.js";
import payrollRunsRoutes from "./modules/payroll-runs/payroll-runs.routes.js";
import aguinaldoRoutes from "./modules/aguinaldo/aguinaldo.routes.js";
import vacationBalancesRoutes from "./modules/vacation-balances/vacation-balances.routes.js";
import leaveTypesRoutes from "./modules/leave-types/leave-types.routes.js";
import leaveRequestsRoutes from "./modules/leave-requests/leave-requests.routes.js";
import employeeTerminationsRoutes from "./modules/employee-terminations/employee-terminations.routes.js";
import fiscalRoutes from "./modules/fiscal/fiscal.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import holidaysRoutes from "./modules/holidays/holidays.routes.js";
import contactRoutes from "./modules/contact/contact.routes.js";
import publicCatalogRoutes from "./modules/public-catalog/public-catalog.routes.js";
import shopAuthRoutes from "./modules/shop-auth/shop-auth.routes.js";
import favoritesRoutes from "./modules/favorites/favorites.routes.js";
import cartRoutes from "./modules/cart/cart.routes.js";
import {
  shopOrdersRouter,
  adminShopOrdersRouter,
} from "./modules/shop-orders/shop-orders.routes.js";
import {
  publicSettingsRouter,
  adminSettingsRouter,
} from "./modules/settings/settings.routes.js";

const env = loadEnv();

function resolveCorsOrigins(): string[] {
  const configured = env.CORS_ORIGIN
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (env.NODE_ENV === "production") {
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

const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo en un minuto." },
});

const app = express();

// Orden: proxy → seguridad (helmet) → CORS → body parser → rutas → error handler
app.set("trust proxy", 1);
app.use((req, res, next) => {
  const requestId = req.header("X-Request-Id")?.trim() || crypto.randomUUID();
  res.setHeader("X-Request-Id", requestId);
  const startedAt = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ event: "http_request", requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt })));
  next();
});
app.use(helmet({
  // API JSON: sin HTML propio, así que la CSP más restrictiva posible (sin directivas por defecto de helmet).
  contentSecurityPolicy: {
    useDefaults: false,
    directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  strictTransportSecurity: env.NODE_ENV === "production" ? undefined : false,
}));
app.use(
  cors({
    origin: resolveCorsOrigins(),
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Request-Id"],
    exposedHeaders: ["Content-Disposition", "X-Request-Id"],
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

app.use("/api/v1", apiRateLimiter);

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/public/catalog", publicCatalogRoutes);
app.use("/api/v1/public/settings", publicSettingsRouter);
app.use("/api/v1/shop/auth", shopAuthRoutes);
app.use("/api/v1/shop/favorites", favoritesRoutes);
app.use("/api/v1/shop/cart", cartRoutes);
app.use("/api/v1/shop/orders", shopOrdersRouter);
app.use("/api/v1/shop-orders", adminShopOrdersRouter);
app.use("/api/v1/contact-messages", contactRoutes);
app.use("/api/v1/settings", adminSettingsRouter);
app.use("/api/v1/employees", employeesRoutes);
app.use("/api/v1/banks", banksRoutes);
app.use("/api/v1/document-types", documentTypesRoutes);
app.use("/api/v1/departments", departmentsRouter);
app.use("/api/v1/positions", positionsRouter);
app.use("/api/v1/customers", customersRoutes);
app.use("/api/v1/products", productsRoutes);
app.use("/api/v1/inventory", inventoryRoutes);
app.use("/api/v1/suppliers", suppliersRouter);
app.use("/api/v1/purchase-orders", purchaseOrdersRouter);
app.use("/api/v1/payroll-periods", payrollPeriodsRoutes);
app.use("/api/v1/payroll-runs", payrollRunsRoutes);
app.use("/api/v1/aguinaldo", aguinaldoRoutes);
app.use("/api/v1/vacation-balances", vacationBalancesRoutes);
app.use("/api/v1/leave-types", leaveTypesRoutes);
app.use("/api/v1/leave-requests", leaveRequestsRoutes);
app.use("/api/v1/employee-terminations", employeeTerminationsRoutes);
app.use("/api/v1/fiscal", fiscalRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/holidays", holidaysRoutes);

// Último middleware: captura errores de controllers y middlewares anteriores
app.use(errorHandler);

export default app;
