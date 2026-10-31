import { SLUG_PATTERN } from '@festpass/shared';
import { describe, expect, it } from 'vitest';
import { slugify, withSuffix } from './slug';

describe('slugify', () => {
  it.each([
    ['Utsav 2027: Pro Night', 'utsav-2027-pro-night'],
    ["Freshers' Night", 'freshers-night'],
    ['Rock & Roll Evening', 'rock-and-roll-evening'],
    ['  Café   Sessions  ', 'cafe-sessions'],
  ])('turns %j into %j', (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });

  it('always produces a valid slug of at least 3 characters', () => {
    for (const title of ['!!', 'A', 'Ω', 'x'.repeat(200)]) {
      const slug = slugify(title);
      expect(slug).toMatch(SLUG_PATTERN);
      expect(slug.length).toBeGreaterThanOrEqual(3);
      expect(slug.length).toBeLessThanOrEqual(60);
    }
  });
});

describe('withSuffix', () => {
  it('keeps the first attempt unchanged and numbers the rest', () => {
    expect(withSuffix('pro-night', 0)).toBe('pro-night');
    expect(withSuffix('pro-night', 1)).toBe('pro-night-2');
  });

  it('stays within the length limit', () => {
    expect(withSuffix('x'.repeat(60), 9)).toHaveLength(60);
  });
});
