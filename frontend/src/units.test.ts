import { describe, expect, it } from 'vitest';
import { formatWeight, fromKilograms, toKilograms } from './units';

describe('measurement conversion', () => {
  it('converts kilograms to pounds for display', () => {
    expect(fromKilograms(100, 'lb')).toBe(220.46);
    expect(formatWeight(100, 'lb')).toBe('220.5 lb');
  });

  it('converts pounds back to kilograms for storage', () => {
    expect(toKilograms(220.46, 'lb')).toBe(100);
  });

  it('leaves kilogram values unchanged', () => {
    expect(fromKilograms(82.5, 'kg')).toBe(82.5);
    expect(toKilograms(82.5, 'kg')).toBe(82.5);
  });

  it('handles empty measurements without inventing a value', () => {
    expect(fromKilograms('', 'lb')).toBe('');
    expect(toKilograms('', 'lb')).toBeNull();
    expect(formatWeight(null, 'kg')).toBe('Not set');
  });
});
