import * as D from 'io-ts/Decoder';
import { pipe } from 'fp-ts/function';
import { fold } from 'fp-ts/Either';

export const decode = <T>(decoder: D.Decoder<unknown, T>) => (input: unknown): T => pipe(
  decoder.decode(input),
  fold(
    error => {
      // eslint-disable-next-line no-console
      console.error(error);
      throw new Error(D.draw(error));
    },
    decoded => decoded,
  ),
);
