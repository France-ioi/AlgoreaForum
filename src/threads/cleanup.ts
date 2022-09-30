import { WSClient } from '../websocket-client';
import { rawUnfollow } from './unfollow';

export async function cleanupConnections(
  wsClient: WSClient,
  participantId: string,
  itemId: string,
  connectionIds: string[]
): Promise<void> {
  return Promise.all(connectionIds.map(connectionId => rawUnfollow(wsClient, participantId, itemId, connectionId)))
    .then(() => undefined);
}