/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import type { TokenData } from '../utils/parsers';

interface HandlerEventMockOptions {
  connectionId?: string,
  body?: any,
  tokenData?: TokenData,
}

const mockEvent = ({ connectionId, body, tokenData }: HandlerEventMockOptions = {}): any => ({
  requestContext: { connectionId },
  body: body || tokenData ? JSON.stringify({ ...body, token: tokenData }) : undefined,
});

export const callHandler = async (
  handler: APIGatewayProxyHandler,
  options: HandlerEventMockOptions = {},
): Promise<APIGatewayProxyResult> => {
  const result = await handler(mockEvent(options), {} as any, (() => {}) as any);
  // @ts-ignore
  return result;
};