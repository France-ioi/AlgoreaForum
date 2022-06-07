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
