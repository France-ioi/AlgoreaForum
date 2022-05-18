import type { APIGatewayProxyEvent } from 'aws-lambda';

export const getConnectionId = (event: APIGatewayProxyEvent) => {
  const id = event.requestContext.connectionId
  if (!id) throw { statusCode: 400, body: 'A connection id is required' }
  return id
};

export const getPayload = (event: APIGatewayProxyEvent): Record<string, any> => {
  try {
    if (!event.body) throw new Error()
    return JSON.parse(event.body)
  } catch (e) {
    throw { statusCode: 400, body: 'A payload is required' }
  }
};