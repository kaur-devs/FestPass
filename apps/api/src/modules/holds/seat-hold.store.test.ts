import { setTimeout as sleep } from 'node:timers/promises';
import { beforeEach, describe, expect, it } from 'vitest';
import { redis, resetRedis } from '../../test/redis';
import { SeatHoldStore } from './seat-hold.store';

const store = new SeatHoldStore(redis);
const EVENT = 'event-1';
const RIYA = 'user-riya';
const ARJUN = 'user-arjun';
const MINUTE = 60_000;

beforeEach(resetRedis);

describe('holding seats', () => {
  it('holds free seats for the user', async () => {
    const result = await store.hold(EVENT, RIYA, ['a1', 'a2'], MINUTE);

    expect(result.status).toBe('held');
    expect(await store.heldSeatIds(EVENT)).toEqual(new Set(['a1', 'a2']));
    expect((await store.current(EVENT, RIYA))?.seatIds).toEqual(['a1', 'a2']);
  });

  it('refuses seats held by someone else and changes nothing', async () => {
    await store.hold(EVENT, RIYA, ['a1'], MINUTE);

    const result = await store.hold(EVENT, ARJUN, ['a1', 'a2'], MINUTE);

    expect(result).toEqual({ status: 'conflict', seatIds: ['a1'] });
    expect(await store.heldSeatIds(EVENT)).toEqual(new Set(['a1']));
    expect(await store.current(EVENT, ARJUN)).toBeNull();
  });

  it('replaces the previous selection and frees dropped seats', async () => {
    await store.hold(EVENT, RIYA, ['a1', 'a2'], MINUTE);

    await store.hold(EVENT, RIYA, ['a2', 'a3'], MINUTE);

    expect(await store.heldSeatIds(EVENT)).toEqual(new Set(['a2', 'a3']));
    expect((await store.hold(EVENT, ARJUN, ['a1'], MINUTE)).status).toBe('held');
  });

  it('lets exactly one of many simultaneous requests win a seat', async () => {
    const users = Array.from({ length: 50 }, (_, i) => `user-${i}`);

    const results = await Promise.all(users.map((user) => store.hold(EVENT, user, ['b7'], MINUTE)));

    expect(results.filter((r) => r.status === 'held')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'conflict')).toHaveLength(49);
  });

  it('releases seats automatically when the hold expires', async () => {
    await store.hold(EVENT, RIYA, ['a1'], 50);
    await sleep(120);

    expect(await store.heldSeatIds(EVENT)).toEqual(new Set());
    expect(await store.current(EVENT, RIYA)).toBeNull();
  });

  it('clears the selection when given no seats', async () => {
    await store.hold(EVENT, RIYA, ['a1'], MINUTE);

    await store.hold(EVENT, RIYA, [], MINUTE);

    expect(await store.heldSeatIds(EVENT)).toEqual(new Set());
  });
});

describe('expiry times', () => {
  it('reports when each held seat will be released', async () => {
    const before = Date.now();
    await store.hold(EVENT, RIYA, ['a1'], MINUTE);
    await store.hold(EVENT, ARJUN, ['b1'], 2 * MINUTE);

    const all = await store.heldSeats(EVENT);
    const some = await store.heldUntil(EVENT, ['a1', 'zz']);

    expect(all.get('a1')?.getTime()).toBeGreaterThanOrEqual(before + MINUTE - 1000);
    expect(all.get('b1')?.getTime()).toBeGreaterThan(before + MINUTE + 30_000);
    expect([...some.keys()]).toEqual(['a1']);
  });
});

describe('checkout', () => {
  it('claims the selection, extends it, and blocks changes until released', async () => {
    await store.hold(EVENT, RIYA, ['a1', 'a2'], 100);
    const expiresAt = new Date(Date.now() + MINUTE);

    const claim = await store.claimForCheckout(EVENT, RIYA, 'checkout-1', expiresAt);
    await sleep(200);

    expect(claim).toEqual({
      status: 'claimed',
      seatIds: expect.arrayContaining(['a1', 'a2']) as unknown,
    });
    expect(await store.heldSeatIds(EVENT)).toEqual(new Set(['a1', 'a2']));
    expect((await store.hold(EVENT, RIYA, ['a3'], MINUTE)).status).toBe('checkout-in-progress');

    await store.release(EVENT, RIYA);
    expect(await store.heldSeatIds(EVENT)).toEqual(new Set());
    expect((await store.hold(EVENT, RIYA, ['a3'], MINUTE)).status).toBe('held');
  });

  it('accepts a retry of the same checkout and rejects a different one', async () => {
    await store.hold(EVENT, RIYA, ['a1'], MINUTE);
    const expiresAt = new Date(Date.now() + MINUTE);
    await store.claimForCheckout(EVENT, RIYA, 'checkout-1', expiresAt);

    expect((await store.claimForCheckout(EVENT, RIYA, 'checkout-1', expiresAt)).status).toBe(
      'claimed',
    );
    expect((await store.claimForCheckout(EVENT, RIYA, 'checkout-2', expiresAt)).status).toBe(
      'checkout-in-progress',
    );
  });

  it('reports an expired hold', async () => {
    await store.hold(EVENT, RIYA, ['a1'], 50);
    await sleep(120);

    const claim = await store.claimForCheckout(
      EVENT,
      RIYA,
      'checkout-1',
      new Date(Date.now() + MINUTE),
    );

    expect(claim.status).toBe('expired');
  });

  it('never releases seats that now belong to someone else', async () => {
    await store.hold(EVENT, RIYA, ['a1'], 50);
    await sleep(120);
    await store.hold(EVENT, ARJUN, ['a1'], MINUTE);

    await store.release(EVENT, RIYA);

    expect(await store.heldSeatIds(EVENT)).toEqual(new Set(['a1']));
  });
});
