/* eslint-disable @typescript-eslint/naming-convention */
import { AttributeValue, DynamoDB } from '@aws-sdk/client-dynamodb';

const dynamoOptions = (): ConstructorParameters<typeof DynamoDB>[0] => {
  switch (process.env.STAGE) {
    case 'local':
      return {
        region: 'localhost',
        endpoint: 'http://localhost:7000',
      };
    case 'test':
      return {
        endpoint: 'http://localhost:8000',
        tls: false,
        region: 'local-env',
        credentials: {
          accessKeyId: 'fakeMyKeyId',
          secretAccessKey: 'fakeSecretAccessKey'
        }
      };
    case 'dev':
    case 'production':
    default:
      return {};
  }
};

export const dynamodb = new DynamoDB(dynamoOptions());

export const toAttributeValue = (value: unknown): AttributeValue => {
  if (typeof value === 'string') return { S: value };
  if (typeof value === 'number') return { N: value.toString() };
  if (typeof value === 'boolean') return { BOOL: value };
  if (value === null) return { NULL: true };
  if (typeof value === 'object') return { M: Object.fromEntries(Object.entries(value).map(([ k, v ]) => [ k, toAttributeValue(v) ])) };
  if (value === null) return { NULL: true };
  throw new Error(`unhandled value ${String(value)}`);
};
export const fromAttributeValue = (attr: AttributeValue): unknown => {
  if (attr.S) return attr.S;
  if (attr.N) return Number(attr.N);
  if (typeof attr.BOOL === 'boolean') return attr.BOOL;
  if (attr.NULL) return null;
  if (attr.M) return Object.fromEntries(Object.entries(attr.M).map(([ k, v ]) => [ k, fromAttributeValue(v) ]));
  throw new Error(`unhandled value ${JSON.stringify(attr, null, 2)}`);
};
export const toDBItem = <T extends Record<string, any>>(value: T): Record<string, AttributeValue> => {
  const entries = Object.entries(value)
    .filter(([ , value ]) => value !== undefined)
    .map(([ key, value ]): [string, AttributeValue] => [ key, toAttributeValue(value) ]);
  return Object.fromEntries(entries);
};
export const fromDBItem = (item: Record<string, AttributeValue>): Record<string, unknown> => {
  const entries = Object.entries(item).map(([ key, attr ]): [ string, unknown ] => [ key, fromAttributeValue(attr) ]);
  return Object.fromEntries(entries);
};
export const toDBParameters = (value: unknown[]): AttributeValue[] => value.map(v => toAttributeValue(v));