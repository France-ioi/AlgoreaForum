const decodeStub = jest.fn((input: any) => input);
const fakeDecode = (_decode: any) => decodeStub;
jest.mock('./utils/decode.ts', () => ({
  decode: fakeDecode,
}));
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as parsers from './parsers';


describe('parsers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('extractTokenData()', () => {
    it('should fail when no payload', () => {
      expect(() => parsers.extractTokenData({} as APIGatewayProxyEvent)).toThrow(Error);
    });

    it('should return decoded token', () => {
      const input = { test: 'toto' };
      const decodedValue = 'any value';
      decodeStub.mockReturnValueOnce(decodedValue);
      const result = parsers.extractTokenData({ body: JSON.stringify({ token: input }) } as APIGatewayProxyEvent);
      expect(decodeStub).toHaveBeenCalledTimes(1);
      expect(decodeStub).toHaveBeenCalledWith(input);
      expect(result).toEqual(decodedValue);
    });
  });

  describe('getConnectionId()', () => {
    it('should throw when no data', () => {
      expect(() => parsers.getConnectionId({ requestContext: {} } as APIGatewayProxyEvent)).toThrow(Error);
      expect(() => parsers.getConnectionId({ requestContext: { connectionId: '' } } as APIGatewayProxyEvent)).toThrow(Error);
      expect(() => parsers.getConnectionId({ requestContext: { connectionId: undefined } } as APIGatewayProxyEvent)).toThrow(Error);
    });

    it('should return connection id', () => {
      const connectionId = 'connectionId';
      expect(parsers.getConnectionId({ requestContext: { connectionId } } as APIGatewayProxyEvent)).toBe(connectionId);
    });
  });
});
