import { dynamodb } from '../dynamodb';
import { TokenData } from '../utils/parsers';
import { ForumTable } from './table';
import { decode2 } from '../utils/decode';
import * as D from 'io-ts/Decoder';
import { invalidConnectionIds, logSendResults, WSClient } from '../websocket-client';
import { cleanupConnections } from './cleanup';

const forumTable = new ForumTable(dynamodb);

export async function sendMessage(wsClient: WSClient, token: TokenData, payload: unknown): Promise<void> {
  const { participantId, itemId, userId } = token;

  const message = decode2(D.struct({ message: D.string }))(payload).message;

  const [ subscribers, createdEvent ] = await Promise.all([
    forumTable.getSubscribers({ participantId, itemId }),
    forumTable.addThreadEvent(participantId, itemId, { eventType: 'message', userId, content: message }),
  ]);
  const connectionIds = subscribers.map(subscriber => subscriber.connectionId);
  const sendResults = await wsClient.sendAll(connectionIds, [ createdEvent ]);
  logSendResults(sendResults);
  await cleanupConnections(wsClient, participantId, itemId, invalidConnectionIds(sendResults));
}
