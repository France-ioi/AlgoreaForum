import { rawUnsubscribe } from './services/unsubscribe';

export async function cleanupConnections(
  participantId: string,
  itemId: string,
  connectionIds: string[]
): Promise<void> {
  return Promise.all(connectionIds.map(connectionId => rawUnsubscribe(participantId, itemId, connectionId)))
    .then(() => undefined);
}