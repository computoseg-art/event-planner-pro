import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { createInstallmentPlan } from './installment-plan.js';
import { runReservationTransaction } from './reservation-transaction.js';

test('creates a plan using a fresh Firebase client and preserves the reservation', {
  skip: !process.env.FIREBASE_DATABASE_EMULATOR_HOST,
}, async () => {
  const projectId = 'demo-event-planner-pro';
  const databaseURL = `https://${projectId}-default-rtdb.firebaseio.com`;
  const writer = initializeApp({ projectId, databaseURL }, 'transaction-writer');
  const reader = initializeApp({ projectId, databaseURL }, 'transaction-reader');
  const writerRef = getDatabase(writer).ref('transaction-test/reservation');
  const readerRef = getDatabase(reader).ref('transaction-test/reservation');

  try {
    await writerRef.set({
      fecha: '2026-12-20',
      total: 1000,
      pagado: 300,
      seniaConfirmadaAt: '2026-02-13T15:00:00.000Z',
    });
    assert.equal((await readerRef.get()).exists(), true);

    let firstValue;
    const coldTransaction = await readerRef.transaction((current) => {
      firstValue = current;
      return;
    });
    assert.equal(firstValue, null);
    assert.equal(coldTransaction.committed, false);

    const result = await runReservationTransaction(readerRef, (current) => {
      if (!current) return;
      return {
        ...current,
        planCuotas: createInstallmentPlan(
          current.total - current.pagado,
          current.fecha,
          new Date('2026-02-13T15:00:00.000Z'),
        ),
      };
    });
    assert.equal(result.committed, true);
    const stored = (await writerRef.get()).val();
    assert.equal(stored.planCuotas.cuotas.length, 10);
    assert.equal(stored.pagado, 300);
  } finally {
    await writerRef.remove();
    await Promise.all([deleteApp(writer), deleteApp(reader)]);
  }
});
