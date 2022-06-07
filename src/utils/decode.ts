import * as D from 'io-ts/Decoder';
import { pipe } from 'fp-ts/function';
import { fold } from 'fp-ts/Either';

export const decode = <T, F>(decoder: D.Decoder<unknown, T>, fallback?: F) => (input: unknown): T | F => pipe(
  decoder.decode(input),
  fold(
    error => {
      if (fallback !== undefined) return fallback;
      // eslint-disable-next-line no-console
      console.error(error);
      throw new Error(D.draw(error));
    },
    decoded => decoded as T | F,
  ),
);
