import type { APIGatewayProxyResult } from 'aws-lambda';

export const ok = (message = ''): APIGatewayProxyResult => ({ statusCode: 200, body: message });
export const badRequest = (message = ''): APIGatewayProxyResult => ({ statusCode: 400, body: message });
export const unauthorized = (message = ''): APIGatewayProxyResult => ({ statusCode: 401, body: message });
export const forbidden = (message = ''): APIGatewayProxyResult => ({ statusCode: 403, body: message });
export const notFound = (message = ''): APIGatewayProxyResult => ({ statusCode: 404, body: message });
export const serverError = (message = 'Internal server error'): APIGatewayProxyResult => ({ statusCode: 500, body: message });
