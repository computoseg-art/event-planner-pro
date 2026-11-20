/**
 * Utility functions for processing installment plans.
 * Calculates payment schedules based on remaining balance and event date.
 */

export interface Cuota {
  id: string;
  numero: number;
  monto: number;
  vencimiento: string;
}

export interface PlanCuotas {
  createdAt: string;
  cuotas: Cuota[];
}

function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Creates an installment plan from a remaining balance and event date.
 */
export function createInstallmentPlan(
  remainingBalance: number,
  eventDate: string,
  confirmationDate = new Date()
): PlanCuotas | null {
  const parsedEventDate =
    /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
      ? new Date(`${eventDate}T00:00:00.000Z`)
      : null;
  if (
    !parsedEventDate ||
    !Number.isFinite(parsedEventDate.getTime()) ||
    parsedEventDate.toISOString().slice(0, 10) !== eventDate ||
    !Number.isFinite(remainingBalance) ||
    remainingBalance <= 0
  ) {
    return null;
  }

  const todayParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Montevideo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(confirmationDate);
  const part = (type: string) =>
    Number(todayParts.find((item) => item.type === type)?.value);
  const currentMonth = part('year') * 12 + part('month') - 1;
  const [eventYear, eventMonth] = eventDate.split('-').map(Number);
  const eventMonthIndex = eventYear * 12 + eventMonth - 1;
  const installmentCount = eventMonthIndex - currentMonth;
  if (installmentCount < 1) return null;

  const balanceInCents = toMinorUnits(remainingBalance);
  if (installmentCount > balanceInCents) return null;
  const baseAmount = Math.floor(balanceInCents / installmentCount);
  const extraCents = balanceInCents % installmentCount;
  const cuotas = Array.from({ length: installmentCount }, (_, index) => {
    const dueMonth = currentMonth + index + 1;
    const year = Math.floor(dueMonth / 12);
    const month = (dueMonth % 12) + 1;
    return {
      id: `cuota-${index + 1}`,
      numero: index + 1,
      vencimiento: `${year}-${String(month).padStart(2, '0')}-01`,
      monto: (baseAmount + (index < extraCents ? 1 : 0)) / 100,
    };
  });

  return {
    createdAt: confirmationDate.toISOString(),
    cuotas,
  };
}
