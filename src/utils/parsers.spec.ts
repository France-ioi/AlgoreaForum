import { APIGatewayProxyEvent } from 'aws-lambda';
import * as parsers from './parsers';


describe('parsers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('extractTokenData()', () => {
    it('should return null when no data', () => {
      expect(parsers.extractTokenData({} as APIGatewayProxyEvent)).toBe(null);
    });

    it('should return decoded token', () => {
      const input = {
        token: {
          participantId: 'participantId',
          itemId: 'itemId',
          userId: 'userId',
          isMine: true,
          canWatchParticipant: false,
        },
      };
      const result = parsers.extractTokenData({ body: JSON.stringify(input) } as APIGatewayProxyEvent);
      expect(result).toEqual(input.token);
    });
  });

  describe('getConnectionId()', () => {
    it('should return null when no data', () => {
      expect(parsers.getConnectionId({ requestContext: {} } as APIGatewayProxyEvent)).toBe(null);
      expect(parsers.getConnectionId({ requestContext: { connectionId: '' } } as APIGatewayProxyEvent)).toBe(null);
      expect(parsers.getConnectionId({ requestContext: { connectionId: undefined } } as APIGatewayProxyEvent)).toBe(null);
    });

    it('should return connection id', () => {
      const connectionId = 'connectionId';
      expect(parsers.getConnectionId({ requestContext: { connectionId } } as APIGatewayProxyEvent)).toBe(connectionId);
    });
  });
});
