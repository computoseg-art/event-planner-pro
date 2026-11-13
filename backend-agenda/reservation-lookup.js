export function findReservationEntry(reservations, reservationId) {
  if (!reservations || typeof reservations !== 'object') return null;

  return (
    Object.entries(reservations).find(([key, reservation]) =>
      reservation &&
      typeof reservation === 'object' &&
      (key === reservationId || String(reservation.id || '') === reservationId),
    ) || null
  );
}
