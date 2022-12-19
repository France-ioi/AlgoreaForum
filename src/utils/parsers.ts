import type { APIGatewayProxyEvent } from 'aws-lambda';
import * as D from 'io-ts/Decoder';
import { WSClient } from '../websocket-client';
import { decodeOrThrow } from './decode';
import { DecodingError } from './errors';

const tokenDataDecoder = D.struct({
  participantId: D.string,
  itemId: D.string,
  userId: D.string,
  isMine: D.boolean,
  canWatchParticipant: D.boolean,
});
const payloadDecoder = D.struct({ token: tokenDataDecoder });

export type TokenData = D.TypeOf<typeof tokenDataDecoder>;

function getPayload(event: APIGatewayProxyEvent): unknown {
  try {
    if (!event.body) throw new DecodingError('null body in the event');
    return JSON.parse(event.body) as unknown;
  } catch {
    throw new DecodingError('the body is not valid JSON');
  }
}

export function parseWsMessage(event: APIGatewayProxyEvent): { wsClient: WSClient, token: TokenData, payload: unknown } {
  const payload = getPayload(event);
  const token = decodeOrThrow(payloadDecoder)(payload).token;
  return { wsClient: new WSClient(event.requestContext), token, payload };
}
