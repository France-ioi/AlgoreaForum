import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';

export function logError(err: unknown): void {
  // eslint-disable-next-line no-console
  if (err instanceof OperationSkipped) console.warn(errorToString(err));
  // eslint-disable-next-line no-console
  else console.error(errorToString(err));
}

export function errorToString(err: unknown): string {
  if (err instanceof TransactionCanceledException) {
    return `${err.name}: ${err.message} - CancellationReasons: ${JSON.stringify(err.CancellationReasons)}`;
  }
  if (err instanceof DBError) {
    return `${err.name}: ${err.message} - Statement(s): ${err.details}`;
  }
  if (err instanceof Error || err instanceof Forbidden || err instanceof ServerError ||
    err instanceof DecodingError || err instanceof OperationSkipped) {
    return `${err.name}: ${err.message}`;
  }
  return `An unexpected error occured (${JSON.stringify(err)})`;
}

export class DBError implements Error {
  name = 'DBError';
  constructor(public message: string /* error description */, public details: string /* statement details */) {}
}

export class DecodingError implements Error {
  name = 'DecodingError';
  constructor(public message: string) {}
}

export class Forbidden implements Error {
  name = 'Forbidden';
  constructor(public message: string) {}
}

export class OperationSkipped implements Error { /* this is not an actual error, it has to be consired as a warning */
  name = 'OperationSkipped';
  constructor(public message: string) {}
}

export class ServerError implements Error {
  name = 'ServerError';
  constructor(public message: string) {}
}
