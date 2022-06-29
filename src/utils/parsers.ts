import type { APIGatewayProxyEvent } from 'aws-lambda';
import * as D from 'io-ts/Decoder';
import { decode } from './decode';

export const getConnectionId = (event: APIGatewayProxyEvent): string | null => event.requestContext.connectionId || null;

export const getPayload = (event: APIGatewayProxyEvent): unknown | null => {
  try {
    if (!event.body) return null;
    return JSON.parse(event.body) as unknown;
  } catch {
    return null;
  }
};

const tokenDataDecoder = D.struct({
  participantId: D.string,
  itemId: D.string,
  userId: D.string,
  isMine: D.boolean,
  canWatchParticipant: D.boolean,
});
const payloadDecoder = D.struct({ token: tokenDataDecoder });

export type TokenData = D.TypeOf<typeof tokenDataDecoder>;
export const extractTokenData = (event: APIGatewayProxyEvent): TokenData | null => {
  const payload = getPayload(event);
  // FIXME: For now, the token is provided as an object but later it will be an actual token (string)
  return decode(payloadDecoder)(payload)?.token || null;
};