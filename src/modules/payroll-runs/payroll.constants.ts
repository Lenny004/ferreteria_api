/**
 * Tasas y bases usadas en la nómina salvadoreña (AFP, ISSS, INSAFORP, honorarios).
 * Centralizar aquí evita discrepancias entre cálculo en BD y capas superiores.
 */
export const RATES = {
  AFP_EMPLOYEE: 0.0725,
  AFP_EMPLOYER: 0.0775,
  ISSS_EMPLOYEE: 0.03,
  ISSS_EMPLOYER: 0.075,
  INSAFORP_EMPLOYER: 0.01,
  HONORARIOS_ISR: 0.1,
} as const;

/** Tope salarial mensual para cotización ISSS empleado/patrón (normativa vigente). */
export const ISSS_SALARY_CAP = 1000;

/** Días de referencia por tipo de período para prorratear salario cuando no se usa calendario explícito. */
export const DAYS_BASE = {
  MENSUAL: 30,
  QUINCENAL: 15,
  SEMANAL: 7,
} as const;

/** Tipos de contrato del catálogo `Employee.contractType`. */
export const CONTRACT_TYPES = ["PLAZO_FIJO", "TIEMPO_PARCIAL", "HONORARIOS", "PASANTE"] as const;
export type ContractTypeValue = (typeof CONTRACT_TYPES)[number];

/** Tipos de período de planilla admitidos. */
export const PAYROLL_PERIOD_TYPES = ["MENSUAL", "QUINCENAL", "SEMANAL"] as const;
export type PayrollPeriodTypeValue = (typeof PAYROLL_PERIOD_TYPES)[number];

/** Estados del ciclo de vida de una corrida de planilla. */
export const PAYROLL_RUN_STATUSES = ["EN_REVISION", "APROBADA", "PAGADA", "ANULADA"] as const;
export type PayrollRunStatusValue = (typeof PAYROLL_RUN_STATUSES)[number];
