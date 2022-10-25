import { dynamodb } from '../dynamodb';
import { TokenData } from '../utils/parsers';
import { WSClient } from '../websocket-client';
import { Threads } from '../threads/table';
import { ThreadSubscriptions } from '../thread-subscriptions/thread-subscriptions';

const subscriptions = new ThreadSubscriptions(dynamodb);
const threads = new Threads(dynamodb);

export async function subscribe(wsClient: WSClient, token: TokenData): Promise<void> {
  const { participantId, itemId, userId } = token;

  const [ events ] = await Promise.all([
    threads.getThreadEvents({ participantId, itemId, limit: 19, asc: false }),
    subscriptions.subscribe({ participantId, itemId }, wsClient.connectionId, userId),
  ]);
  await wsClient.send(wsClient.connectionId, events);
}
