import { APIGatewayEventDefaultAuthorizerContext, APIGatewayEventRequestContextWithAuthorizer, APIGatewayProxyEvent } from 'aws-lambda';
import * as parsers from './parsers';

const sampleToken = { participantId: 'p1', itemId: 'i1', userId: 'u1', isMine: false, canWatchParticipant: false };
const sampleContext = { connectionId: 'abcd', domainName: 'http://example.org', stage: 'prod' } as
  APIGatewayEventRequestContextWithAuthorizer<APIGatewayEventDefaultAuthorizerContext>;

describe('parsers', () => {
  describe('parseWsMessage()', () => {
    it('should fail when no body', () => {
      expect(() => parsers.parseWsMessage({} as APIGatewayProxyEvent)).toThrow('the body is not valid JSON');
    });

    it('should fail when no json-decodable body', () => {
      expect(() => parsers.parseWsMessage({ body: '{ a:' } as APIGatewayProxyEvent)).toThrow('the body is not valid JSON');
      expect(() => parsers.parseWsMessage({ body: 'invalid' } as APIGatewayProxyEvent)).toThrow('the body is not valid JSON');
    });

    it('should fail when no or unparsable token', () => {
      expect(() => parsers.parseWsMessage({ body: '{}', requestContext: sampleContext } as APIGatewayProxyEvent)).toThrow('cannot decode');
      expect(() => parsers.parseWsMessage({
        body: '{ "token": false }',
        requestContext: sampleContext
      } as APIGatewayProxyEvent)).toThrow('cannot decode');
      expect(() => parsers.parseWsMessage({
        body: '{ "token": { "itemId": "i1", "userId": "u1", "isMine": false, "canWatchParticipant": false }}',
        requestContext: sampleContext
      } as APIGatewayProxyEvent)).toThrow('cannot decode');
    });

    it('should decode the token as expected', () => {
      const { token } = parsers.parseWsMessage({
        body: '{ "token": { "participantId": "p1", "itemId": "i1", "userId": "u1", "isMine": false, "canWatchParticipant": false }}',
        requestContext: sampleContext
      } as APIGatewayProxyEvent);
      expect(token).toEqual(sampleToken);
    });

    it('should fail if there is no connectionId in the context', () => {
      expect(() => parsers.parseWsMessage({
        body: `{ "token": ${JSON.stringify(sampleToken)}}`,
        requestContext: {}
      } as APIGatewayProxyEvent)).toThrow('missing connection id');
    });

    it('should return a wsClient', () => {
      const { wsClient } = parsers.parseWsMessage({
        body: `{ "token": ${JSON.stringify(sampleToken)}}`,
        requestContext: sampleContext
      } as APIGatewayProxyEvent);
      expect(wsClient).toBeTruthy();
    });

    it('should return the payload', () => {
      const { payload } = parsers.parseWsMessage({
        body: `{ "token": ${JSON.stringify(sampleToken)}, "somedata": 1}`,
        requestContext: sampleContext
      } as APIGatewayProxyEvent);
      expect((payload as { somedata: number }).somedata).toEqual(1);
    });
  });

});
