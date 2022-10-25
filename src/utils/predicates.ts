
export const isNotUndefined = <T>(e: T|undefined): e is T => e !== undefined;

export const isNotNull = <T>(value: T | null): value is T => value !== null;
