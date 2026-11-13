import assert from 'node:assert/strict';
import test from 'node:test';
import { createInstallmentPlan } from './installment-plan.js';

test('creates monthly installments from the next month through the event month', () => {
  const now = new Date('2026-02-13T15:00:00.000Z');
  const plan = createInstallmentPlan(1000, '2026-12-20', now);

  assert.equal(plan.cuotas.length, 10);
  assert.equal(plan.cuotas[0].vencimiento, '2026-03-01');
  assert.equal(plan.cuotas[9].vencimiento, '2026-12-01');
  assert.equal(plan.cuotas.reduce((sum, cuota) => sum + cuota.monto, 0), 1000);
});

test('distributes leftover cents without changing the balance total', () => {
  const plan = createInstallmentPlan(
    100,
    '2026-05-20',
    new Date('2026-02-13T15:00:00.000Z'),
  );

  assert.deepEqual(
    plan.cuotas.map((cuota) => cuota.monto),
    [33.34, 33.33, 33.33],
  );
  assert.equal(plan.cuotas.reduce((sum, cuota) => sum + cuota.monto, 0), 100);
});

test('does not create a plan without at least one future monthly due date', () => {
  const now = new Date('2026-02-13T15:00:00.000Z');

  assert.equal(createInstallmentPlan(100, '2026-02-20', now), null);
  assert.equal(createInstallmentPlan(0.02, '2026-05-20', now), null);
});
