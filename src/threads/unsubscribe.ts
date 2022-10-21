import { dynamodb } from '../dynamodb';
import { TokenData } from '../utils/parsers';
import { invalidConnectionIds, logSendResults, SendResult, WSClient } from '../websocket-client';
import { cleanupConnections } from './cleanup';
import { ForumTable } from './table';

const forumTable = new ForumTable(dynamodb);

export async function unsubscribe(wsClient: WSClient, token: TokenData): Promise<void> {
  const { participantId, itemId } = token;
  const sendResults = await rawUnsubscribe(wsClient, participantId, itemId, wsClient.connectionId);
  logSendResults(sendResults);
  await cleanupConnections(wsClient, participantId, itemId, invalidConnectionIds(sendResults));
}

export async function rawUnsubscribe(
  wsClient: WSClient,
  participantId: string,
  itemId: string,
  connectionId: string
): Promise<SendResult[]> {
  const [ subscribeEvent ] = await forumTable.getSubscribers({
    participantId,
    itemId,
    filters: { connectionId: connectionId },
  });

  if (!subscribeEvent) return [];

  await forumTable.removeThreadEvent(subscribeEvent);
  const subscribers = await forumTable.getSubscribers({ participantId, itemId });
  return await wsClient.sendAll(
    subscribers.map(subscriber => subscriber.connectionId),
    [{ ...subscribeEvent, time: Date.now(), eventType: 'unsubscribe' }],
  );
}
