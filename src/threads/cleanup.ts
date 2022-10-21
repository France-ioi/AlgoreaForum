import { WSClient } from '../websocket-client';
import { rawUnsubscribe } from './unsubscribe';

export async function cleanupConnections(
  wsClient: WSClient,
  participantId: string,
  itemId: string,
  connectionIds: string[]
): Promise<void> {
  return Promise.all(connectionIds.map(connectionId => rawUnsubscribe(wsClient, participantId, itemId, connectionId)))
    .then(() => undefined);
}