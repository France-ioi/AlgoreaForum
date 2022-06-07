export const mockEvent = ({ connectionId }: { connectionId?: string } = {}): any => ({
  requestContext: { connectionId },
});
export const mockContext = (): any => ({});
