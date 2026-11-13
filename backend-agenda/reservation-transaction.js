export async function runReservationTransaction(reservationRef, update) {
  let onValue;
  try {
    await new Promise((resolve, reject) => {
      onValue = () => resolve();
      reservationRef.on('value', onValue, reject);
    });
    return await reservationRef.transaction(update);
  } finally {
    if (onValue) reservationRef.off('value', onValue);
  }
}
