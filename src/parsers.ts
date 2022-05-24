import type { APIGatewayProxyEvent } from 'aws-lambda';

export const getConnectionId = (event: APIGatewayProxyEvent): string => {
  const id = event.requestContext.connectionId;
  if (!id) throw { statusCode: 400, body: 'A connection id is required' };
  return id;
};

const isObject = (obj: unknown): obj is Record<string, unknown> =>
  typeof obj === 'object' && obj !== null && obj.constructor === Object.prototype.constructor;

export const getPayload = (event: APIGatewayProxyEvent): Record<string, unknown> => {
  try {
    if (!event.body) throw new Error();
    const result = JSON.parse(event.body) as unknown;
    if (!isObject(result)) throw new Error();
    return result;
  } catch (e) {
    throw { statusCode: 400, body: 'A payload object is required' };
  }
};