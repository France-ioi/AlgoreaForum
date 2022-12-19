import * as D from 'io-ts/Decoder';
import { pipe } from 'fp-ts/function';
import { fold } from 'fp-ts/Either';
import { DecodingError } from './errors';

// Return a decoder function which throw a `DecodingError` if decoding fails
export function decodeOrThrow<T>(decoder: D.Decoder<unknown, T>) {
  return (input: unknown): T => pipe(
    decoder.decode(input),
    fold(
      error => {
        throw new DecodingError(D.draw(error));
      },
      decoded => decoded,
    ),
  );
}

// Return a decoder function which return `null` for undecodable inputs.
export const decodeOrNull = <T>(decoder: D.Decoder<unknown, T>) => (input: unknown): T | null => pipe(
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
