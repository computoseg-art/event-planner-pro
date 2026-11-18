/**
 * Utility functions for processing installment plans.
 * Calculates payment schedules based on remaining balance and event date.
 */

interface Cuota {
  numero: number;
  monto: number;
  fechaVencimiento: string;
  estado: 'pendiente' | 'pagada' | 'vencida';
}

export interface PlanCuotas {
  cuotas: Cuota[];
  totalCuotas: number;
  montoTotal: number;
  frecuenciaDias: number;
}

/**
 * Creates an installment plan from a remaining balance and event date.
 */
export function createInstallmentPlan(
  remainingBalance: number,
  eventDate: string,
  confirmationDate: Date
): PlanCuotas {
  const installmentAmount = Math.round(remainingBalance / 10);
  const cuotas: Cuota[] = [];
  
  let currentDate = new Date(confirmationDate);
  currentDate.setDate(currentDate.getDate() + 30);

  for (let i = 1; i <= 10; i++) {
    cuotas.push({
      numero: i,
      monto: installmentAmount,
      fechaVencimiento: currentDate.toISOString().split('T')[0],
      estado: 'pendiente',
    });
    currentDate.setDate(currentDate.getDate() + 30);
  }

  return {
    cuotas,
    totalCuotas: 10,
    montoTotal: remainingBalance,
    frecuenciaDias: 30,
  };
}
