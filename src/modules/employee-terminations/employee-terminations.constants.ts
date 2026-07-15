/**
 * Motivos de baja laboral (`hr.EmployeeTerminations.reason`).
 *
 * Solo `DESPIDO_INJUSTIFICADO` genera indemnización (Código de Trabajo SV, Art. 58);
 * el resto de motivos liquida vacaciones pendientes y aguinaldo proporcional, sin indemnización.
 */
export const TERMINATION_REASONS = [
  "RENUNCIA_VOLUNTARIA",
  "DESPIDO_JUSTIFICADO",
  "DESPIDO_INJUSTIFICADO",
  "MUTUO_ACUERDO",
  "VENCIMIENTO_CONTRATO",
  "FALLECIMIENTO",
  "JUBILACION",
] as const;
export type TerminationReason = (typeof TERMINATION_REASONS)[number];

/** Días de indemnización por año de servicio en despido injustificado (Art. 58 Código de Trabajo). */
export const INDEMNIZACION_DAYS_PER_YEAR = 30;
