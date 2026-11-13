import assert from 'node:assert/strict';
import test from 'node:test';
import { findReservationEntry } from './reservation-lookup.js';

test('finds a reservation by its Firebase key', () => {
  const reservation = { id: 'key-1', descripcion: 'Boda' };
  const entries = { 'key-1': reservation };

  assert.deepEqual(findReservationEntry(entries, 'key-1'), ['key-1', reservation]);
});

test('finds a reservation by its stored id when its Firebase key differs', () => {
  const reservation = { id: 'reservation-1', descripcion: 'Cumpleaños' };
  const entries = { 'firebase-key': reservation };

  assert.deepEqual(
    findReservationEntry(entries, 'reservation-1'),
    ['firebase-key', reservation],
  );
});

test('ignores malformed entries and returns null when no reservation matches', () => {
  assert.equal(
    findReservationEntry({ empty: null, invalid: 'value' }, 'reservation-1'),
    null,
  );
});
