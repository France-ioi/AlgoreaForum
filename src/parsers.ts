import type { APIGatewayProxyEvent } from 'aws-lambda';
import * as D from 'io-ts/Decoder';
import { decode } from './utils/decode';

export const getConnectionId = (event: APIGatewayProxyEvent): string => {
  const id = event.requestContext.connectionId;
  if (!id) throw { statusCode: 400, body: 'A connection id is required' };
  return id;
};

const isObject = (obj: unknown): obj is Record<string, unknown> =>
  typeof obj === 'object' && obj !== null && obj.constructor === Object.prototype.constructor;

export const getPayload = (event: APIGatewayProxyEvent): Record<string, unknown> => {
  try {
    if (!event.body) throw new Error();
    const result = JSON.parse(event.body) as unknown;
    if (!isObject(result)) throw new Error();
    return result;
  } catch (e) {
    throw new Error('A payload object is required');
  }
};

const tokenDataDecoder = D.struct({
  participantId: D.string,
  itemId: D.string,
  userId: D.string,
  isMine: D.boolean,
  canWatchParticipant: D.boolean,
});
export type TokenData = D.TypeOf<typeof tokenDataDecoder>;
export const extractTokenData = (event: APIGatewayProxyEvent): TokenData => {
  // FIXME: For now, the token is provided as an object but later it will be an actual token (string)
  const { token } = getPayload(event);
  const tokenData = decode(tokenDataDecoder)(token);
  if (!tokenData) throw new Error('Invalid token data');
  return tokenData;
};