import { dynamodb } from '../dynamodb';
import { TokenData } from '../utils/parsers';
import { ForumTable } from './table';
import { invalidConnectionIds, logSendResults, WSClient } from '../websocket-client';
import { cleanupConnections } from './cleanup';

const forumTable = new ForumTable(dynamodb);

export async function closeThread(wsClient: WSClient, token: TokenData): Promise<void> {
  const { participantId, itemId, userId } = token;

  const threadClosedEvent = await forumTable.addThreadEvent(participantId, itemId, {
    eventType: 'thread_closed',
    byUserId: userId,
  });
  const subscribers = await forumTable.getSubscribers({ participantId, itemId });
  const connectionIds = subscribers.map(subscriber => subscriber.connectionId);
  const sendResults = await wsClient.sendAll(connectionIds, [ threadClosedEvent ]);
  logSendResults(sendResults);
  await cleanupConnections(wsClient, participantId, itemId, invalidConnectionIds(sendResults));
}
