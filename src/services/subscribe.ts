import { dynamodb } from '../dynamodb';
import { TokenData } from '../utils/parsers';
import { WSClient } from '../websocket-client';
import { ThreadSubscriptions } from '../thread-models/thread-subscriptions';
import { ThreadEvents } from '../thread-models/thread-events';

const subscriptions = new ThreadSubscriptions(dynamodb);
const threadEvents = new ThreadEvents(dynamodb);

export async function subscribe(wsClient: WSClient, token: TokenData): Promise<void> {
  const { participantId, itemId, userId } = token;

  await Promise.all([
    threadEvents.getAll({ participantId, itemId })
      .then(events => wsClient.send(wsClient.connectionId, events)),
    subscriptions.subscribe({ participantId, itemId }, wsClient.connectionId, userId),
  ]);
}
