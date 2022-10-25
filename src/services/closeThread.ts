import { dynamodb } from '../dynamodb';
import { TokenData } from '../utils/parsers';
import { Threads } from '../thread-models/thread-events';
import { invalidConnectionIds, logSendResults, WSClient } from '../websocket-client';
import { cleanupConnections } from '../cleanup';
import { ThreadSubscriptions } from '../thread-models/thread-subscriptions';

const subscriptions = new ThreadSubscriptions(dynamodb);
const threads = new Threads(dynamodb);

export async function closeThread(wsClient: WSClient, token: TokenData): Promise<void> {
  const { participantId, itemId, userId } = token;

  const threadClosedEvent = await threads.addThreadEvent(participantId, itemId, {
    eventType: 'thread_closed',
    byUserId: userId,
  });
  const subscribers = await subscriptions.getSubscribers({ participantId, itemId });
  const connectionIds = subscribers.map(subscriber => subscriber.connectionId);
  const sendResults = await wsClient.sendAll(connectionIds, [ threadClosedEvent ]);
  logSendResults(sendResults);
  await cleanupConnections(participantId, itemId, invalidConnectionIds(sendResults));
}
