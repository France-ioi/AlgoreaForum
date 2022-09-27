import { dynamodb } from '../dynamodb';
import { TokenData } from '../utils/parsers';
import { ForumTable } from './table';
import { WSClient } from '../websocket-client';

const forumTable = new ForumTable(dynamodb);

export async function closeThread(wsClient: WSClient, token: TokenData): Promise<void> {
  const { participantId, itemId, userId } = token;

  const threadClosedEvent = await forumTable.addThreadEvent(participantId, itemId, {
    eventType: 'thread_closed',
    byUserId: userId,
  });
  const followers = await forumTable.getFollowers({ participantId, itemId });
  const connectionIds = followers.map(follower => follower.connectionId);
  await wsClient.sendAll(connectionIds, [ threadClosedEvent ]);
}
