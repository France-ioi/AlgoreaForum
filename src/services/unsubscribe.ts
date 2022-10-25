import { dynamodb } from '../dynamodb';
import { TokenData } from '../utils/parsers';
import { WSClient } from '../websocket-client';
import { ThreadSubscriptions } from '../thread-models/thread-subscriptions';

const subscriptions = new ThreadSubscriptions(dynamodb);

/**
 * Unsubscribe from a thread
 * It is a connection which unsubscribes, not a user, as just stops sending messages to an instance of the application (possibly many)
 */
export async function unsubscribe(wsClient: WSClient, token: TokenData): Promise<void> {
  const { participantId, itemId } = token;
  await rawUnsubscribe(participantId, itemId, wsClient.connectionId);
}

export async function rawUnsubscribe(participantId: string, itemId: string, connectionId: string): Promise<void> {
  const subscribers = await subscriptions.getSubscribersWithConnection({ participantId, itemId }, connectionId);
  if (subscribers.length > 1) console.warn('more than a subscriber for a pk and connection id (not really expected)');
  if (subscribers.length === 0) console.warn('no subscriber for the requested pk and connection id (not really expected)');
  await subscriptions.unsubscribe(subscribers);
}
