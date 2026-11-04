import { useState } from 'react';

export const STICKY_THEAD_CLASS =
  'sticky top-0 z-20 bg-[#0F172A] shadow-[0_1px_0_0_#1E293B]';

export type SortPrimitive = string | number | boolean | null | undefined;

function isNilOrNaN(v: SortPrimitive): v is null | undefined {
  return (
    v === null ||
    v === undefined ||
    (typeof v === 'number' && Number.isNaN(v))
  );
}

export function compareSortValues(
  a: SortPrimitive,
  b: SortPrimitive,
  asc: boolean
): number {
  const aNil = isNilOrNaN(a);
  const bNil = isNilOrNaN(b);
  if (aNil && bNil) return 0;
  if (aNil) return 1;
  if (bNil) return -1;

  if (typeof a === 'boolean' && typeof b === 'boolean') {
    const diff = Number(a) - Number(b);
    return asc ? diff : -diff;
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return asc ? a - b : b - a;
  }

  const cmp = String(a).localeCompare(String(b), 'es', {
    sensitivity: 'base',
    numeric: true,
  });
  return asc ? cmp : -cmp;
}

export function sortRows<T>(
  rows: readonly T[],
  getValue: (row: T, index: number) => SortPrimitive,
  asc: boolean
): T[] {
  return rows
    .map((row, index) => ({ row, index, val: getValue(row, index) }))
    .sort((x, y) => {
      const cmp = compareSortValues(x.val, y.val, asc);
      return cmp !== 0 ? cmp : x.index - y.index;
    })
    .map((item) => item.row);
}

export function parseStreakCodeValue(code: string | null | undefined): number {
  if (!code) return 0;
  const num = Number(code.replace(/[^0-9]/g, '')) || 0;
  if (code.startsWith('W')) return num;
  if (code.startsWith('L')) return -num;
  return num;
}

export function useTableSort<K extends string = string>(
  initialKey: K | null = null,
  initialAsc = false,
  defaultAscKeys: readonly K[] = []
) {
  const [sortKey, setSortKey] = useState<K | null>(initialKey);
  const [sortAsc, setSortAsc] = useState<boolean>(initialAsc);

  const toggleSort = (key: K, forceInitialAsc?: boolean) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(
        forceInitialAsc !== undefined
          ? forceInitialAsc
          : defaultAscKeys.includes(key)
      );
    }
  };

  return { sortKey, sortAsc, toggleSort, setSortKey, setSortAsc };
}
