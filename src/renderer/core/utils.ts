import * as PIXI from 'pixi.js';
import { Instance, InstanceProps } from './renderer';
import { RootState } from './store';

export const is = {
  obj: (a: any) => a === Object(a) && !is.arr(a) && typeof a !== 'function',
  fun: (a: any): a is Function => typeof a === 'function',
  str: (a: any): a is string => typeof a === 'string',
  num: (a: any): a is number => typeof a === 'number',
  boo: (a: any): a is boolean => typeof a === 'boolean',
  und: (a: any) => a === void 0,
  arr: (a: any) => Array.isArray(a),
  equ(a: any, b: any, { arrays = 'shallow', objects = 'reference', strict = true }: EquConfig = {}) {
    // Wrong type or one of the two undefined, doesn't match
    if (typeof a !== typeof b || !!a !== !!b) return false;
    // Atomic, just compare a against b
    if (is.str(a) || is.num(a)) return a === b;
    const isObj = is.obj(a);
    if (isObj && objects === 'reference') return a === b;
    const isArr = is.arr(a);
    if (isArr && arrays === 'reference') return a === b;
    // Array or Object, shallow compare first to see if it's a match
    if ((isArr || isObj) && a === b) return true;
    // Last resort, go through keys
    let i;
    for (i in a) if (!(i in b)) return false;
    for (i in strict ? b : a) if (a[i] !== b[i]) return false;
    if (is.und(i)) {
      if (isArr && a.length === 0 && b.length === 0) return true;
      if (isObj && Object.keys(a).length === 0 && Object.keys(b).length === 0) return true;
      if (a !== b) return false;
    }
    return true;
  },
};

// Disposes an object and all its properties
export function dispose<TObj extends { dispose?: () => void; type?: string; [key: string]: any }>(obj: TObj) {
  if (obj.dispose && obj.type !== 'Scene') obj.dispose();
  for (const p in obj) {
    (p as any).dispose?.();
    delete obj[p];
  }
}

/**
 * Returns instance root state
 */
export const getRootState = (obj: any): RootState | undefined => (obj as unknown as Instance).__pixi?.root.getState();

export type EquConfig = {
  /** Compare arrays by reference equality a === b (default), or by shallow equality */
  arrays?: 'reference' | 'shallow';
  /** Compare objects by reference equality a === b (default), or by shallow equality */
  objects?: 'reference' | 'shallow';
  /** If true the keys in both a and b must match 1:1 (default), if false a's keys must intersect b's */
  strict?: boolean;
};

/**
 * Picks or omits keys from an object
 * `omit` will filter out keys, and otherwise cherry-pick them.
 */
export function filterKeys<TObj extends { [key: string]: any }, TOmit extends boolean, TKey extends keyof TObj>(
  obj: TObj,
  omit: TOmit,
  ...keys: TKey[]
): TOmit extends true ? Omit<TObj, TKey> : Pick<TObj, TKey> {
  const keysToSelect = new Set(keys);
  return Object.entries(obj).reduce((acc, [key, value]) => {
    const shouldInclude = !omit;
    if (keysToSelect.has(key as TKey) === shouldInclude) acc[key] = value;
    return acc;
  }, {} as any);
}

/**
 * Clones an object and cherry-picks keys.
 */
export const pick = <TObj>(obj: Partial<TObj>, keys: Array<keyof TObj>) =>
  filterKeys<Partial<TObj>, false, keyof TObj>(obj, false, ...keys);

/**
 * Clones an object and prunes or omits keys.
 */
export const omit = <TObj>(obj: Partial<TObj>, keys: Array<keyof TObj>) =>
  filterKeys<Partial<TObj>, true, keyof TObj>(obj, true, ...keys);
