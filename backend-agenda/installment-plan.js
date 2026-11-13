function toMinorUnits(amount) {
  return Math.round(Number(amount) * 100);
}

export function createInstallmentPlan(balance, eventDate, now = new Date()) {
  const parsedEventDate =
    typeof eventDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
      ? new Date(`${eventDate}T00:00:00.000Z`)
      : null;
  if (
    !parsedEventDate ||
    !Number.isFinite(parsedEventDate.getTime()) ||
    parsedEventDate.toISOString().slice(0, 10) !== eventDate ||
    !Number.isFinite(Number(balance)) ||
    Number(balance) <= 0
  ) {
    return null;
  }

  const todayParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Montevideo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const part = (type) => Number(todayParts.find((item) => item.type === type)?.value);
  const currentMonth = part('year') * 12 + part('month') - 1;
  const [eventYear, eventMonth] = eventDate.split('-').map(Number);
  const eventMonthIndex = eventYear * 12 + eventMonth - 1;
  const installmentCount = eventMonthIndex - currentMonth;
  if (installmentCount < 1) return null;

  const balanceInCents = toMinorUnits(balance);
  if (installmentCount > balanceInCents) return null;
  const baseAmount = Math.floor(balanceInCents / installmentCount);
  const extraCents = balanceInCents % installmentCount;
  const dueDates = Array.from({ length: installmentCount }, (_, index) => {
    const dueMonth = currentMonth + index + 1;
    const year = Math.floor(dueMonth / 12);
    const month = dueMonth % 12 + 1;
    return `${year}-${String(month).padStart(2, '0')}-01`;
  });

  return {
    createdAt: now.toISOString(),
    cuotas: dueDates.map((vencimiento, index) => ({
      id: `cuota-${index + 1}`,
      numero: index + 1,
      vencimiento,
      monto: (baseAmount + (index < extraCents ? 1 : 0)) / 100,
    })),
  };
}
