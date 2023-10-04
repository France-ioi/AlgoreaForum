import type { APIGatewayProxyEvent } from 'aws-lambda';
import * as D from 'io-ts/Decoder';
import { WSClient } from '../websocket-client';
import { decodeOrThrow } from './decode';
import { DecodingError } from './errors';
import { compactVerify, importSPKI } from 'jose';
import { toUtf8 } from '@smithy/util-utf8';

const tokenDataDecoder = D.struct({
  participantId: D.string,
  itemId: D.string,
  userId: D.string,
  isMine: D.boolean,
  canWatch: D.boolean,
  canWrite: D.boolean
});
const payloadDecoder = D.struct({ token: tokenDataDecoder });

export type TokenData = D.TypeOf<typeof tokenDataDecoder>;

const payloadWithJwsDecoder = D.struct({ token: D.string });

const jwsPayloadDecoder = D.struct({
  item_id: D.string,
  participant_id: D.string,
  user_id: D.string,
  is_mine: D.boolean,
  can_watch: D.boolean,
  can_write: D.boolean,
});

function getPayload(event: APIGatewayProxyEvent): unknown {
  try {
    if (!event.body) throw new DecodingError('null body in the event');
    return JSON.parse(event.body) as unknown;
  } catch {
    throw new DecodingError('the body is not valid JSON');
  }
}

export async function parseWsMessage(event: APIGatewayProxyEvent): Promise<{ wsClient: WSClient, token: TokenData, payload: unknown }> {
  const payload = getPayload(event);
  // Temporarily handle 2 formats of token. The first one will have to be removed soon.
  try {
    const token = decodeOrThrow(payloadDecoder)(payload).token;
    return { wsClient: new WSClient(event.requestContext), token, payload };
  } catch (_err) {
    const jws = decodeOrThrow(payloadWithJwsDecoder)(payload).token;
    if (!process.env.BACKEND_PUBLIC_KEY) throw new Error('no backend public key found to verify the token');
    const publicKey = await importSPKI(process.env.BACKEND_PUBLIC_KEY, 'ES256');
    const res = await compactVerify(jws, publicKey);
    const jwsPayload = decodeOrThrow(jwsPayloadDecoder)(JSON.parse(toUtf8(res.payload)));
    return { wsClient: new WSClient(event.requestContext), token: {
      participantId: jwsPayload.participant_id,
      itemId: jwsPayload.item_id,
      userId: jwsPayload.user_id,
      isMine: jwsPayload.is_mine,
      canWatch: jwsPayload.can_watch,
      canWrite: jwsPayload.can_write,
    }, payload };
  }
}
