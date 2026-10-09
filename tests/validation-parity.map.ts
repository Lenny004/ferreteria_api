import type { ZodTypeAny } from "zod";
import { loginSchema as adminLoginSchema, forgotPasswordSchema } from "../src/modules/auth/auth.controller.js";
import { GenerateSchema as aguinaldoGenerateSchema } from "../src/modules/aguinaldo/aguinaldo.controller.js";
import {
  forgotSchema,
  loginSchema as shopLoginSchema,
  profileSchema,
  registerSchema,
} from "../src/modules/shop-auth/shop-auth.controller.js";
import {
  createSchema as customerCreateSchema,
  listQuerySchema as customerListSchema,
  updateSchema as customerUpdateSchema,
} from "../src/modules/customers/customers.controller.js";
import {
  createSchema as bankCreateSchema,
  updateSchema as bankUpdateSchema,
} from "../src/modules/banks/banks.controller.js";
import {
  createSchema as supplierCreateSchema,
  listQuerySchema as supplierListSchema,
  updateSchema as supplierUpdateSchema,
} from "../src/modules/purchasing/suppliers.controller.js";
import {
  createSchema as contactCreateSchema,
  listQuerySchema as contactListSchema,
  updateSchema as contactUpdateSchema,
} from "../src/modules/contact/contact.controller.js";
import {
  createSchema as employeeCreateSchema,
  listQuerySchema as employeeListSchema,
  updateSchema as employeeUpdateSchema,
} from "../src/modules/employees/employees.controller.js";
import {
  createSchema as employeeBankCreateSchema,
  updateSchema as employeeBankUpdateSchema,
} from "../src/modules/employees/employee-bank-accounts.controller.js";
import {
  createSchema as employeeDocumentCreateSchema,
  updateSchema as employeeDocumentUpdateSchema,
} from "../src/modules/employees/employee-documents.controller.js";
import {
  createSchema as productCreateSchema,
  listQuerySchema as productListSchema,
  updateSchema as productUpdateSchema,
} from "../src/modules/products/products.controller.js";
import { listQuerySchema as publicProductListSchema } from "../src/modules/public-catalog/public-catalog.controller.js";
import {
  dteQuerySchema,
  generateSchema as fiscalGenerateSchema,
} from "../src/modules/fiscal/fiscal.controller.js";
import {
  createSchema as purchaseCreateSchema,
  lineSchema as purchaseLineSchema,
  listQuerySchema as purchaseListSchema,
  updateSchema as purchaseUpdateSchema,
} from "../src/modules/purchasing/purchase-orders.controller.js";
import {
  adminListSchema as shopOrderListSchema,
  adminUpdateSchema as shopOrderUpdateSchema,
  checkoutSchema,
  transferReferenceSchema,
} from "../src/modules/shop-orders/shop-orders.controller.js";
import { payOrderSchema } from "../src/modules/shop-payments/shop-payments.controller.js";
import {
  createSchema as inventoryCreateSchema,
  listQuerySchema as inventoryListSchema,
} from "../src/modules/inventory/inventory.controller.js";
import {
  captureLineSchema as inventoryCaptureLineSchema,
  createSchema as inventoryCountCreateSchema,
  linesQuerySchema as inventoryLinesSchema,
} from "../src/modules/inventory/inventory-counts.controller.js";
import {
  cancelSchema as inventoryCountCancelSchema,
  listSchema as inventoryCountListSchema,
} from "../src/modules/inventory/inventory-counts.controller.js";
import { importLineSchema as inventoryImportLineSchema } from "../src/modules/inventory/inventory.controller.js";
import { LeaveTypeBodySchema } from "../src/modules/leave-types/leave-types.controller.js";
import {
  CreateSchema as leaveCreateSchema,
  ListSchema as leaveListSchema,
  ReviewSchema as leaveReviewSchema,
} from "../src/modules/leave-requests/leave-requests.controller.js";
import { UpdateSchema as vacationUpdateSchema } from "../src/modules/vacation-balances/vacation-balances.controller.js";
import {
  CreateSchema as terminationCreateSchema,
  VoidSchema as terminationVoidSchema,
} from "../src/modules/employee-terminations/employee-terminations.controller.js";
import {
  ListQuerySchema,
  PeriodBodySchema,
  PeriodFieldsSchema,
  UpdatePeriodSchema,
} from "../src/modules/payroll-periods/payroll-periods.controller.js";
import {
  GenerateRunSchema,
  ListRunsSchema,
  UpdateDetailSchema,
} from "../src/modules/payroll-runs/payroll-runs.controller.js";
import {
  createSchema as documentTypeCreateSchema,
  updateSchema as documentTypeUpdateSchema,
} from "../src/modules/document-types/document-types.controller.js";
import {
  createSchema as holidayCreateSchema,
  listQuerySchema as holidayListSchema,
  updateSchema as holidayUpdateSchema,
} from "../src/modules/holidays/holidays.controller.js";
import { upsertSchema as cartUpsertSchema } from "../src/modules/cart/cart.controller.js";
import { keyParamSchema as settingKeySchema, upsertSchema as settingUpsertSchema } from "../src/modules/settings/settings.controller.js";
import { receiveSchema as purchaseReceiveSchema } from "../src/modules/purchasing/purchase-orders.controller.js";

/** Entrada revisable que vincula una propiedad Zod con una columna Prisma. */
export interface ValidationParityEntry {
  schema: ZodTypeAny;
  field: string;
  model: string;
  column: string;
  operation: "alta" | "actualizacion" | "consulta";
  /** Indica que el esquema admite redondear antes de validar la escala. */
  allowsRounding?: boolean;
}

const fields = (
  schema: ZodTypeAny,
  model: string,
  operation: ValidationParityEntry["operation"],
  names: Record<string, string>,
): ValidationParityEntry[] => Object.entries(names).map(([field, column]) => ({
  schema,
  field,
  model,
  column,
  operation,
}));

/**
 * Mapa explícito de entradas Zod que llegan a columnas persistidas o usadas como filtros.
 * Las estructuras anidadas se registran con su esquema propio para no ocultar límites.
 */
export const validationParityMap: ValidationParityEntry[] = [
  ...fields(aguinaldoGenerateSchema, "AguinaldoRun", "alta", { year: "year", notes: "notes" }),
  ...fields(adminLoginSchema, "WebUser", "consulta", { login: "email", email: "email", username: "username" }),
  ...fields(forgotPasswordSchema, "WebUser", "consulta", { email: "email" }),
  ...fields(registerSchema, "ShopCustomer", "alta", { email: "email", fullName: "fullName", phone: "phone" }),
  ...fields(shopLoginSchema, "ShopCustomer", "consulta", { email: "email" }),
  ...fields(forgotSchema, "ShopCustomer", "consulta", { email: "email" }),
  ...fields(profileSchema, "ShopCustomer", "actualizacion", { fullName: "fullName", phone: "phone" }),

  ...fields(customerListSchema, "Customer", "consulta", { q: "address", customerType: "customerType" }),
  ...fields(customerCreateSchema, "Customer", "alta", {
    name: "name", customerType: "customerType", dui: "dui", nit: "nit", nrc: "nrc", phone: "phone",
    email: "email", address: "address", municipality: "municipality", department: "department",
  }),
  ...fields(customerUpdateSchema, "Customer", "actualizacion", {
    name: "name", customerType: "customerType", dui: "dui", nit: "nit", nrc: "nrc", phone: "phone",
    email: "email", address: "address", municipality: "municipality", department: "department",
  }),
  ...fields(supplierListSchema, "Supplier", "consulta", { q: "name", country: "country" }),
  ...fields(supplierCreateSchema, "Supplier", "alta", {
    name: "name", tradeName: "tradeName", nit: "nit", nrc: "nrc", contactName: "contactName", phone: "phone",
    email: "email", address: "address", municipality: "municipality", department: "department", country: "country",
    creditDays: "creditDays", notes: "notes",
  }),
  ...fields(supplierUpdateSchema, "Supplier", "actualizacion", {
    name: "name", tradeName: "tradeName", nit: "nit", nrc: "nrc", contactName: "contactName", phone: "phone",
    email: "email", address: "address", municipality: "municipality", department: "department", country: "country",
    creditDays: "creditDays", notes: "notes",
  }),
  ...fields(contactCreateSchema, "ContactMessage", "alta", { name: "name", email: "email", phone: "phone", subject: "subject", message: "message" }),
  ...fields(contactListSchema, "ContactMessage", "consulta", { status: "status", q: "adminNotes" }),
  ...fields(contactUpdateSchema, "ContactMessage", "actualizacion", { status: "status", adminNotes: "adminNotes" }),

  ...fields(employeeListSchema, "Employee", "consulta", { q: "address" }),
  ...fields(employeeCreateSchema, "Employee", "alta", {
    firstName: "firstName", lastName: "lastName", hireDate: "hireDate", baseSalary: "baseSalary", dui: "dui", nit: "nit",
    positionId: "positionId", departmentId: "departmentId", contractType: "contractType", salaryType: "salaryType",
    phone: "phone", email: "email", canSell: "canSell", canCashier: "canCashier", pin: "pinHash",
  }),
  ...fields(employeeUpdateSchema, "Employee", "actualizacion", {
    firstName: "firstName", lastName: "lastName", hireDate: "hireDate", baseSalary: "baseSalary", dui: "dui", nit: "nit",
    positionId: "positionId", departmentId: "departmentId", contractType: "contractType", salaryType: "salaryType",
    phone: "phone", email: "email", canSell: "canSell", canCashier: "canCashier", pin: "pinHash",
  }),
  ...fields(productListSchema, "Product", "consulta", { q: "notes", minPrice: "salePrice", maxPrice: "salePrice" }),
  ...fields(publicProductListSchema, "Product", "consulta", { q: "notes" }).map((entry) => ({ ...entry, allowsRounding: false })),
  ...fields(publicProductListSchema, "Product", "consulta", { minPrice: "salePrice", maxPrice: "salePrice" }).map((entry) => ({ ...entry, allowsRounding: true })),
  ...fields(productCreateSchema, "Product", "alta", {
    code: "code", description: "description", familyId: "familyId", measurementTypeId: "measurementTypeId",
    subfamilyId: "subfamilyId", barcode: "barcode", salePrice: "salePrice", costPrice: "costPrice",
    currentStock: "currentStock", minStock: "minStock", notes: "notes",
  }),
  ...fields(productUpdateSchema, "Product", "actualizacion", {
    code: "code", description: "description", familyId: "familyId", measurementTypeId: "measurementTypeId",
    subfamilyId: "subfamilyId", barcode: "barcode", salePrice: "salePrice", costPrice: "costPrice",
    currentStock: "currentStock", minStock: "minStock", maxStock: "maxStock", reorderPoint: "reorderPoint", notes: "notes",
  }),

  ...fields(purchaseListSchema, "PurchaseOrder", "consulta", { status: "status", q: "notes" }),
  ...fields(purchaseLineSchema, "PurchaseOrderDetail", "alta", { quantity: "quantity", unitCost: "unitCost", taxRate: "taxRate", notes: "notes" }),
  ...fields(purchaseCreateSchema, "PurchaseOrder", "alta", { supplierId: "supplierId", supplierDocNumber: "supplierDocNumber", supplierDocType: "supplierDocType", notes: "notes", expectedDate: "expectedDate" }),
  ...fields(purchaseUpdateSchema, "PurchaseOrder", "actualizacion", { supplierId: "supplierId", supplierDocNumber: "supplierDocNumber", supplierDocType: "supplierDocType", notes: "notes", expectedDate: "expectedDate" }),
  ...fields(checkoutSchema, "ShopOrder", "alta", { customerNotes: "customerNotes", deliveryType: "deliveryType", shippingAddress: "shippingAddress", paymentMethod: "paymentMethod" }),
  ...fields(shopOrderListSchema, "ShopOrder", "consulta", { q: "customerNotes" }),
  ...fields(shopOrderUpdateSchema, "ShopOrder", "actualizacion", { status: "status", adminNotes: "adminNotes", cancellationNote: "adminNotes" }),
  ...fields(transferReferenceSchema, "ShopPayment", "actualizacion", { reference: "customerReference", notes: "notes" }),
  ...fields(payOrderSchema, "ShopPayment", "actualizacion", { method: "method", providerRef: "providerRef", notes: "notes", expectedCustomerReference: "customerReference", expectedCustomerReferenceAt: "customerReferenceAt" }),
  ...fields(cartUpsertSchema, "ShopCartItem", "actualizacion", { quantity: "quantity" }),
  ...fields(settingUpsertSchema, "Setting", "actualizacion", { value: "value", description: "description" }),

  ...fields(inventoryListSchema, "InventoryMovement", "consulta", { movementType: "movementType" }),
  ...fields(inventoryCreateSchema, "InventoryMovement", "alta", { productId: "productId", movementType: "movementType", quantity: "quantity", unitCost: "unitCost", reason: "reason" }),
  ...fields(inventoryImportLineSchema, "Product", "consulta", { productCode: "code" }),
  ...fields(inventoryImportLineSchema, "InventoryMovement", "alta", { movementType: "movementType", quantity: "quantity", unitCost: "unitCost", reason: "reason" }),
  ...fields(inventoryCountCreateSchema, "InventoryCount", "alta", { name: "name", familyId: "familyId", subfamilyId: "subfamilyId", notes: "notes" }),
  ...fields(inventoryCaptureLineSchema, "InventoryCountLine", "actualizacion", { productId: "productId", countedQuantity: "countedQuantity", notes: "notes" }),
  ...fields(inventoryLinesSchema, "Product", "consulta", { q: "notes" }),

  ...fields(bankCreateSchema, "Bank", "alta", { name: "name", code: "code", swift: "swift" }),
  ...fields(bankUpdateSchema, "Bank", "actualizacion", { name: "name", code: "code", swift: "swift" }),
  ...fields(documentTypeCreateSchema, "RequiredDocumentType", "alta", { name: "name", description: "description", appliesToContractType: "appliesToContractType" }),
  ...fields(documentTypeUpdateSchema, "RequiredDocumentType", "actualizacion", { name: "name", description: "description", appliesToContractType: "appliesToContractType" }),
  ...fields(employeeBankCreateSchema, "EmployeeBankAccount", "alta", { bankId: "bankId", accountType: "accountType", accountNumber: "accountNumber" }),
  ...fields(employeeDocumentCreateSchema, "EmployeeDocument", "alta", { docTypeId: "docTypeId", status: "status", fileUrl: "fileUrl", fileName: "fileName", issueDate: "issueDate", expiryDate: "expiryDate", notes: "notes" }),
  ...fields(employeeDocumentUpdateSchema, "EmployeeDocument", "actualizacion", { docTypeId: "docTypeId", status: "status", fileUrl: "fileUrl", fileName: "fileName", issueDate: "issueDate", expiryDate: "expiryDate", notes: "notes" }),
  ...fields(employeeBankUpdateSchema, "EmployeeBankAccount", "actualizacion", { accountType: "accountType", accountNumber: "accountNumber" }),
  ...fields(holidayCreateSchema, "Holiday", "alta", { name: "name", date: "date", year: "year" }),
  ...fields(holidayListSchema, "Holiday", "consulta", { year: "year" }),
  ...fields(holidayUpdateSchema, "Holiday", "actualizacion", { name: "name", date: "date", year: "year" }),
  ...fields(LeaveTypeBodySchema, "LeaveType", "alta", { name: "name", category: "category", maxDaysPerYear: "maxDaysPerYear", legalBasis: "legalBasis" }),
  ...fields(leaveCreateSchema, "LeaveRequest", "alta", { employeeId: "employeeId", leaveTypeId: "leaveTypeId", startDate: "startDate", endDate: "endDate", daysRequested: "daysRequested", halfDayPeriod: "halfDayPeriod", reason: "reason", documentUrl: "documentUrl" }),
  ...fields(leaveReviewSchema, "LeaveRequest", "actualizacion", { reviewNotes: "reviewNotes" }),
  ...fields(vacationUpdateSchema, "VacationBalance", "actualizacion", { daysEarned: "daysEarned", daysTaken: "daysTaken", lastVacationDate: "lastVacationDate", nextVacationDue: "nextVacationDue" }),
  ...fields(terminationCreateSchema, "EmployeeTermination", "alta", { employeeId: "employeeId", terminationDate: "terminationDate", reason: "reason", pendingSalary: "pendingSalary", settlementNotes: "settlementNotes", documentUrl: "documentUrl" }),
  ...fields(terminationVoidSchema, "EmployeeTermination", "actualizacion", { reason: "voidReason" }),
  ...fields(PeriodFieldsSchema, "PayrollPeriod", "alta", { name: "name", periodType: "periodType", startDate: "startDate", endDate: "endDate", paymentDate: "paymentDate" }),
  ...fields(PeriodBodySchema, "PayrollPeriod", "alta", { name: "name", periodType: "periodType", startDate: "startDate", endDate: "endDate", paymentDate: "paymentDate" }),
  ...fields(GenerateRunSchema, "PayrollRun", "alta", { periodId: "periodId", name: "name", notes: "notes" }),
  ...fields(UpdateDetailSchema, "PayrollDetail", "actualizacion", {
    overtimeHoursDiurnal: "overtimeHoursDiurnal", overtimeHoursNocturnal: "overtimeHoursNocturnal", overtimeHoursHoliday: "overtimeHoursHoliday",
    bonuses: "bonuses", viaticos: "viaticos", loanDeduction: "loanDeduction", otherDeductions: "otherDeductions", otherEarnings: "otherEarnings",
    paymentChannel: "paymentChannel", notes: "notes",
  }),
  ...fields(ListRunsSchema, "PayrollRun", "consulta", { status: "status" }),
  ...fields(ListQuerySchema, "PayrollPeriod", "consulta", { periodType: "periodType" }),
  ...fields(UpdatePeriodSchema, "PayrollPeriod", "actualizacion", { name: "name", periodType: "periodType" }),
  ...fields(leaveListSchema, "LeaveRequest", "consulta", { status: "status" }),
  ...fields(dteQuerySchema, "DteIssued", "consulta", { dteType: "dteType", mhStatus: "mhStatus" }),
  ...fields(fiscalGenerateSchema, "IvaReport", "alta", { year: "year", month: "month", reportType: "reportType", notes: "notes" }),
  ...fields(inventoryCountListSchema, "InventoryCount", "consulta", { status: "status" }),
  ...fields(inventoryCountCancelSchema, "InventoryCount", "actualizacion", { reason: "notes" }),
  ...fields(purchaseReceiveSchema, "PurchaseOrder", "actualizacion", { supplierDocNumber: "supplierDocNumber", supplierDocType: "supplierDocType" }),
  ...fields(shopOrderListSchema, "ShopOrder", "consulta", { status: "status", paymentStatus: "paymentStatus" }),
  ...fields(settingKeySchema, "Setting", "consulta", { key: "key" }),
];
