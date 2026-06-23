export type UnitPreference = 'kg' | 'lb';

const poundsPerKilogram = 2.20462;

export function fromKilograms(value: string | number | null | undefined, unit: UnitPreference) {
  if (value === null || value === undefined || value === '') return '';
  const kilograms = Number(value);
  const converted = unit === 'lb' ? kilograms * poundsPerKilogram : kilograms;
  return Math.round(converted * 100) / 100;
}

export function toKilograms(value: string | number | null | undefined, unit: UnitPreference) {
  if (value === null || value === undefined || value === '') return null;
  const measurement = Number(value);
  const kilograms = unit === 'lb' ? measurement / poundsPerKilogram : measurement;
  return Math.round(kilograms * 100) / 100;
}

export function formatWeight(
  kilograms: string | number | null | undefined,
  unit: UnitPreference,
  maximumFractionDigits = 1
) {
  const converted = fromKilograms(kilograms, unit);
  if (converted === '') return 'Not set';
  return `${Number(converted).toLocaleString(undefined, { maximumFractionDigits })} ${unit}`;
}
