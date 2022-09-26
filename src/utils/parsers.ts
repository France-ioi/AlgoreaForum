import type { APIGatewayProxyEvent } from 'aws-lambda';
import * as D from 'io-ts/Decoder';
import { WSClient } from '../websocket-client';
import { decode, decode2 } from './decode';
import { DecodingError } from './errors';

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

export function getPayload2(event: APIGatewayProxyEvent): unknown {
  try {
    if (!event.body) throw new DecodingError('null body in the event');
    return JSON.parse(event.body) as unknown;
  } catch {
    throw new DecodingError('the body is not valid JSON');
  }
}

export function parseWsMessage(event: APIGatewayProxyEvent): { wsClient: WSClient, token: TokenData, payload: unknown } {
  const payload = getPayload2(event);
  const token = decode2(payloadDecoder)(payload).token;
  return { wsClient: new WSClient(event.requestContext), token, payload };
}
