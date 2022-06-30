/* eslint-disable @typescript-eslint/strict-boolean-expressions */

export const mockEvent = ({ connectionId, body }: { connectionId?: string, body?: any } = {}): any => ({
  requestContext: { connectionId },
  body: body ? JSON.stringify(body) : undefined,
});
export const mockContext = (): any => ({});
export const mockCallback = (): any => ({});
