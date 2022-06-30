import * as D from 'io-ts/Decoder';
import { pipe } from 'fp-ts/function';
import { fold } from 'fp-ts/Either';

export const decode = <T>(decoder: D.Decoder<unknown, T>) => (input: unknown): T | null => pipe(
  decoder.decode(input),
  fold(
    () => null,
    decoded => decoded,
  ),
);

/**
 * Decoder for Date type
 */
export const dateDecoder: D.Decoder<unknown, Date> = pipe(
  D.string,
  D.parse(s => {
    const date = new Date(s);
    return Number.isNaN(date.valueOf()) ? D.failure(s, 'DateFromString') : D.success(date);
  }),
);
