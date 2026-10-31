const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function wallClock(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(date)
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  return parts;
}

function offsetMs(date: Date, timeZone: string): number {
  const p = wallClock(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function zonedLocalToUtc(local: string, timeZone: string): Date {
  const match = LOCAL_DATE_TIME.exec(local);
  if (!match) throw new Error(`Expected YYYY-MM-DDTHH:mm, got "${local}"`);
  const part = (index: number) => Number(match[index]);
  const wallAsUtc = Date.UTC(part(1), part(2) - 1, part(3), part(4), part(5));

  const firstGuess = wallAsUtc - offsetMs(new Date(wallAsUtc), timeZone);
  const corrected = wallAsUtc - offsetMs(new Date(firstGuess), timeZone);
  return new Date(corrected);
}

export function utcToZonedLocal(instant: Date | string, timeZone: string): string {
  const p = wallClock(new Date(instant), timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatEventDate(instant: Date | string, timeZone: string): string {
  const date = new Date(instant);
  const dayParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  const day = `${dayParts.weekday ?? ''}, ${dayParts.day ?? ''} ${dayParts.month ?? ''}`;
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  return `${day} · ${time}`;
}

export function formatPrice(paise: number): string {
  if (paise === 0) return 'Free';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}
