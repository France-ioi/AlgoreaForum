/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import type { TokenData } from '../utils/parsers';

export const mockEvent = ({ connectionId, body, tokenData }: { connectionId?: string, body?: any, tokenData?: TokenData } = {}): any => ({
  requestContext: { connectionId },
  body: body || tokenData ? JSON.stringify({ ...body, token: tokenData }) : undefined,
});
export const mockContext = (): any => ({});
export const mockCallback = (): any => ({});
