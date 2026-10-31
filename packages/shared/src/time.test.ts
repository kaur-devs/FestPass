import { describe, expect, it } from 'vitest';
import {
  formatEventDate,
  formatPrice,
  isValidTimeZone,
  utcToZonedLocal,
  zonedLocalToUtc,
} from './time';

describe('zonedLocalToUtc', () => {
  it('converts India Standard Time, which has no daylight saving', () => {
    expect(zonedLocalToUtc('2027-02-14T18:30', 'Asia/Kolkata').toISOString()).toBe(
      '2027-02-14T13:00:00.000Z',
    );
  });

  it('uses the offset in force on that date across daylight saving changes', () => {
    expect(zonedLocalToUtc('2027-01-15T12:00', 'America/New_York').toISOString()).toBe(
      '2027-01-15T17:00:00.000Z',
    );
    expect(zonedLocalToUtc('2027-07-15T12:00', 'America/New_York').toISOString()).toBe(
      '2027-07-15T16:00:00.000Z',
    );
  });

  it('rejects malformed input', () => {
    expect(() => zonedLocalToUtc('14/02/2027 18:30', 'Asia/Kolkata')).toThrow();
  });
});

describe('utcToZonedLocal', () => {
  it('round-trips with zonedLocalToUtc', () => {
    for (const timeZone of ['Asia/Kolkata', 'America/New_York', 'Europe/London']) {
      const local = '2027-07-15T09:45';
      expect(utcToZonedLocal(zonedLocalToUtc(local, timeZone), timeZone)).toBe(local);
    }
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects others', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});

describe('formatEventDate', () => {
  it('formats in the event timezone', () => {
    expect(formatEventDate('2027-02-14T13:00:00Z', 'Asia/Kolkata')).toMatch(
      /^Sun, 14 Feb · 6:30\sPM$/,
    );
  });
});

describe('formatPrice', () => {
  it('formats rupees from paise with Indian digit grouping', () => {
    expect(formatPrice(49_900)).toBe('₹499');
    expect(formatPrice(129_950)).toBe('₹1,299.50');
    expect(formatPrice(12_990_000)).toBe('₹1,29,900');
  });

  it('labels free tickets', () => {
    expect(formatPrice(0)).toBe('Free');
  });
});
