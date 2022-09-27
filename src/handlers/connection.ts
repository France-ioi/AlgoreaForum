import { APIGatewayProxyHandler } from 'aws-lambda';
import { ok } from '../utils/responses';

export const handler: APIGatewayProxyHandler = () => Promise.resolve(ok());