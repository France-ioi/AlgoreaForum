/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import type { TokenData } from '../utils/parsers';

interface HandlerEventMockOptions {
  connectionId?: string,
  body?: any,
  tokenData?: TokenData,
}

export const mockEvent = ({ connectionId, body, tokenData }: HandlerEventMockOptions = {}): any => ({
  requestContext: { connectionId },
  body: body || tokenData ? JSON.stringify({ ...body, token: tokenData }) : undefined,
});
export const mockContext = (): any => ({});
export const mockCallback = (): any => ({});

export const callHandler = async (
  handler: APIGatewayProxyHandler,
  options: HandlerEventMockOptions = {},
): Promise<APIGatewayProxyResult> => {
  const result = await handler(mockEvent(options), mockContext(), mockCallback());
  // @ts-ignore
  return result;
};