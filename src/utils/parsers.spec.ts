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

  describe('getPayload()', () => {
    it('should return null when no data', () => {
      expect(parsers.getPayload({} as APIGatewayProxyEvent)).toBe(null);
      expect(parsers.getPayload({ body: null } as APIGatewayProxyEvent)).toBe(null);
      expect(parsers.getPayload({ body: '' } as APIGatewayProxyEvent)).toBe(null);
    });

    it('should return null when data is not parseable', () => {
      expect(parsers.getPayload({ body: new Date() } as unknown as APIGatewayProxyEvent)).toBe(null);
    });


    it('should return the payload following JSON.parse rules', () => {
      expect(parsers.getPayload({ body: 21 } as unknown as APIGatewayProxyEvent)).toBe(21);
      expect(parsers.getPayload({ body: '[]' } as APIGatewayProxyEvent)).toEqual([]);
      expect(parsers.getPayload({ body: '{"hello": "world"}' } as APIGatewayProxyEvent)).toEqual({ hello: 'world' });
      expect(parsers.getPayload({ body: '"hello"' } as APIGatewayProxyEvent)).toEqual('hello');
    });
  });
});
