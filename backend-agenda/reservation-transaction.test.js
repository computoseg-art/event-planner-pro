import assert from 'node:assert/strict';
import test from 'node:test';
import { runReservationTransaction } from './reservation-transaction.js';
import { createInstallmentPlan } from './installment-plan.js';

function fakeReservationRef(initialValue) {
  let value = initialValue;
  let listener = null;
  let watchedDuringTransaction = false;
  return {
    on(event, callback) {
      assert.equal(event, 'value');
      listener = callback;
      queueMicrotask(() => callback({ val: () => value }));
    },
    off(event, callback) {
      assert.equal(event, 'value');
      assert.equal(callback, listener);
      listener = null;
    },
    async transaction(update) {
      watchedDuringTransaction = Boolean(listener);
      const result = update(listener ? value : null);
      if (result === undefined) return { committed: false };
      value = result;
      return { committed: true, snapshot: { val: () => value } };
    },
    get listening() {
      return Boolean(listener);
    },
    get watchedDuringTransaction() {
      return watchedDuringTransaction;
    },
    setValue(next) {
      value = next;
    },
  };
}

test('creates an installment plan when the reservation is not initially cached', async () => {
  const ref = fakeReservationRef({
    fecha: '2026-12-20',
    total: 1000,
    pagado: 300,
    seniaConfirmadaAt: '2026-02-13T15:00:00.000Z',
  });
  const result = await runReservationTransaction(ref, (current) => {
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
  assert.equal(result.snapshot.val().planCuotas.cuotas.length, 10);
  assert.equal(ref.watchedDuringTransaction, true);
  assert.equal(ref.listening, false);
});

test('does not recreate a reservation deleted during a concurrent transaction', async () => {
  const ref = fakeReservationRef({ total: 100 });
  ref.transaction = async (update) => {
    assert.ok(update({ total: 100 }));
    ref.setValue(null);
    const retriedValue = update(null);
    return { committed: retriedValue !== undefined };
  };
  const result = await runReservationTransaction(ref, (current) =>
    current === null ? undefined : { ...current, planCuotas: {} },
  );
  assert.equal(result.committed, false);
  assert.equal(ref.listening, false);
});

test('removes the listener if the transaction fails', async () => {
  const ref = fakeReservationRef({ total: 100 });
  await assert.rejects(
    runReservationTransaction(ref, () => {
      throw new Error('transaction failed');
    }),
    /transaction failed/,
  );
  assert.equal(ref.listening, false);
});

test('propagates listener errors and removes the listener', async () => {
  let removed = false;
  const ref = {
    on(_event, _callback, onError) {
      queueMicrotask(() => onError(new Error('listener failed')));
    },
    off() {
      removed = true;
    },
  };
  await assert.rejects(runReservationTransaction(ref, () => ({})), /listener failed/);
  assert.equal(removed, true);
});
