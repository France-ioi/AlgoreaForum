import { APIGatewayEventRequestContext, APIGatewayProxyEvent } from 'aws-lambda';

export type SocketHandler = (event: APIGatewayProxyEvent, context: APIGatewayEventRequestContext) => Promise<void>;
