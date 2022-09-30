import { dynamodb } from '../dynamodb';
import { TokenData } from '../utils/parsers';
import { invalidConnectionIds, logSendResults, SendResult, WSClient } from '../websocket-client';
import { cleanupConnections } from './cleanup';
import { ForumTable } from './table';

const forumTable = new ForumTable(dynamodb);

export async function unfollow(wsClient: WSClient, token: TokenData): Promise<void> {
  const { participantId, itemId } = token;
  const sendResults = await rawUnfollow(wsClient, participantId, itemId, wsClient.connectionId);
  logSendResults(sendResults);
  await cleanupConnections(wsClient, participantId, itemId, invalidConnectionIds(sendResults));
}

export async function rawUnfollow(wsClient: WSClient, participantId: string, itemId: string, connectionId: string): Promise<SendResult[]> {
  const [ followEvent ] = await forumTable.getFollowers({
    participantId,
    itemId,
    filters: { connectionId: connectionId },
  });

  if (!followEvent) return [];

  await forumTable.removeThreadEvent(followEvent);
  const followers = await forumTable.getFollowers({ participantId, itemId });
  return await wsClient.sendAll(
    followers.map(follower => follower.connectionId),
    [{ ...followEvent, time: Date.now(), eventType: 'unfollow' }],
  );
}
