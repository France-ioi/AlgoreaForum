import { dynamodb } from '../dynamodb';
import { TokenData } from '../utils/parsers';
import { WSClient } from '../websocket-client';
import { ForumTable } from './table';

const forumTable = new ForumTable(dynamodb);

export async function unfollow(wsClient: WSClient, token: TokenData): Promise<void> {
  const { participantId, itemId, userId } = token;

  const [ followEvent ] = await forumTable.getFollowers({
    participantId,
    itemId,
    filters: { userId, connectionId: wsClient.connectionId },
  });

  if (!followEvent) return;

  await forumTable.removeThreadEvent(followEvent);
  const followers = await forumTable.getFollowers({ participantId, itemId });
  await wsClient.sendAll(
    followers.map(follower => follower.connectionId),
    [{ ...followEvent, time: Date.now(), eventType: 'unfollow' }],
  );

}
