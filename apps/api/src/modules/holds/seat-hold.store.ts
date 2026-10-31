import type { Redis } from 'ioredis';

const HOLD_SCRIPT = `
local held, selection, checkout = KEYS[1], KEYS[2], KEYS[3]
local userId, ttl = ARGV[1], tonumber(ARGV[2])

if redis.call('EXISTS', checkout) == 1 then return {-1} end

local conflicts = {}
for i = 3, #ARGV do
  local owner = redis.call('HGET', held, ARGV[i])
  if owner and owner ~= userId then conflicts[#conflicts + 1] = ARGV[i] end
end
if #conflicts > 0 then
  table.insert(conflicts, 1, 0)
  return conflicts
end

local wanted = {}
for i = 3, #ARGV do wanted[ARGV[i]] = true end
for _, seat in ipairs(redis.call('SMEMBERS', selection)) do
  if not wanted[seat] and redis.call('HGET', held, seat) == userId then
    redis.call('HDEL', held, seat)
  end
end
redis.call('DEL', selection)

if #ARGV >= 3 then
  for i = 3, #ARGV do redis.call('HSET', held, ARGV[i], userId) end
  redis.call('HPEXPIRE', held, ttl, 'FIELDS', #ARGV - 2, unpack(ARGV, 3))
  redis.call('SADD', selection, unpack(ARGV, 3))
  redis.call('PEXPIRE', selection, ttl)
end
return {1}
`;

const CLAIM_SCRIPT = `
local held, selection, checkout = KEYS[1], KEYS[2], KEYS[3]
local userId, expiresAt, checkoutId = ARGV[1], tonumber(ARGV[2]), ARGV[3]

local current = redis.call('GET', checkout)
if current and current ~= checkoutId then return {-1} end

local seats = redis.call('SMEMBERS', selection)
if #seats == 0 then return {0} end
for _, seat in ipairs(seats) do
  if redis.call('HGET', held, seat) ~= userId then return {0} end
end

redis.call('HPEXPIREAT', held, expiresAt, 'FIELDS', #seats, unpack(seats))
redis.call('PEXPIREAT', selection, expiresAt)
redis.call('SET', checkout, checkoutId, 'PXAT', expiresAt)
table.insert(seats, 1, 1)
return seats
`;

const RELEASE_SCRIPT = `
local held, selection, checkout = KEYS[1], KEYS[2], KEYS[3]
local userId = ARGV[1]
for _, seat in ipairs(redis.call('SMEMBERS', selection)) do
  if redis.call('HGET', held, seat) == userId then redis.call('HDEL', held, seat) end
end
redis.call('DEL', selection, checkout)
return 1
`;

const HELD_WITH_TTL_SCRIPT = `
local fields = redis.call('HKEYS', KEYS[1])
if #fields == 0 then return {} end
local ttls = redis.call('HPTTL', KEYS[1], 'FIELDS', #fields, unpack(fields))
local result = {}
for i, field in ipairs(fields) do
  result[#result + 1] = field
  result[#result + 1] = ttls[i]
end
return result
`;

type ScriptReply = (number | string)[];

export type HoldResult =
  | { status: 'held'; expiresAt: Date }
  | { status: 'conflict'; seatIds: string[] }
  | { status: 'checkout-in-progress' };

export type ClaimResult =
  | { status: 'claimed'; seatIds: string[] }
  | { status: 'expired' }
  | { status: 'checkout-in-progress' };

export interface CurrentHold {
  seatIds: string[];
  expiresAt: Date;
}

function keys(eventId: string, userId: string) {
  const slot = `{event:${eventId}}`;
  return [`${slot}:held`, `${slot}:selection:${userId}`, `${slot}:checkout:${userId}`] as const;
}

export class SeatHoldStore {
  constructor(private readonly redis: Redis) {}

  async hold(
    eventId: string,
    userId: string,
    seatIds: readonly string[],
    ttlMs: number,
  ): Promise<HoldResult> {
    const reply = (await this.redis.eval(
      HOLD_SCRIPT,
      3,
      ...keys(eventId, userId),
      userId,
      ttlMs,
      ...seatIds,
    )) as ScriptReply;

    const [code, ...rest] = reply;
    if (code === -1) return { status: 'checkout-in-progress' };
    if (code === 0) return { status: 'conflict', seatIds: rest.map(String) };
    return { status: 'held', expiresAt: new Date(Date.now() + ttlMs) };
  }

  async current(eventId: string, userId: string): Promise<CurrentHold | null> {
    const [, selection] = keys(eventId, userId);
    const [seatIds, ttl] = await Promise.all([
      this.redis.smembers(selection),
      this.redis.pttl(selection),
    ]);
    if (seatIds.length === 0 || ttl <= 0) return null;
    return { seatIds: seatIds.sort(), expiresAt: new Date(Date.now() + ttl) };
  }

  async claimForCheckout(
    eventId: string,
    userId: string,
    checkoutId: string,
    expiresAt: Date,
  ): Promise<ClaimResult> {
    const reply = (await this.redis.eval(
      CLAIM_SCRIPT,
      3,
      ...keys(eventId, userId),
      userId,
      expiresAt.getTime(),
      checkoutId,
    )) as ScriptReply;

    const [code, ...seatIds] = reply;
    if (code === -1) return { status: 'checkout-in-progress' };
    if (code === 0) return { status: 'expired' };
    return { status: 'claimed', seatIds: seatIds.map(String) };
  }

  async release(eventId: string, userId: string): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 3, ...keys(eventId, userId), userId);
  }

  async checkoutId(eventId: string, userId: string): Promise<string | null> {
    const [, , checkout] = keys(eventId, userId);
    return this.redis.get(checkout);
  }

  async heldSeatIds(eventId: string): Promise<Set<string>> {
    return new Set((await this.heldSeats(eventId)).keys());
  }

  async heldSeats(eventId: string): Promise<Map<string, Date>> {
    const [held] = keys(eventId, '');
    const reply = (await this.redis.eval(HELD_WITH_TTL_SCRIPT, 1, held)) as ScriptReply;
    const now = Date.now();
    const seats = new Map<string, Date>();
    for (let i = 0; i < reply.length; i += 2) {
      const ttl = Number(reply[i + 1]);
      if (ttl > 0) seats.set(String(reply[i]), new Date(now + ttl));
    }
    return seats;
  }

  async heldUntil(eventId: string, seatIds: readonly string[]): Promise<Map<string, Date>> {
    if (seatIds.length === 0) return new Map();
    const [held] = keys(eventId, '');
    const ttls = (await this.redis.call(
      'HPTTL',
      held,
      'FIELDS',
      seatIds.length,
      ...seatIds,
    )) as number[];
    const now = Date.now();
    const seats = new Map<string, Date>();
    seatIds.forEach((seatId, index) => {
      const ttl = ttls[index] ?? -2;
      if (ttl > 0) seats.set(seatId, new Date(now + ttl));
    });
    return seats;
  }
}
