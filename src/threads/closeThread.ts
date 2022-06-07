import { dynamodb } from '../dynamodb';
import { sendAll } from './messages';
import { extractTokenData } from '../parsers';
import type { SocketHandler } from '../utils/types';
import { ForumTable } from './table';

const forumTable = new ForumTable(dynamodb);

export const handler: SocketHandler = async event => {
  const tokenData = extractTokenData(event);
  const { participantId, itemId, userId } = tokenData;

  const threadClosedEvent = await forumTable.addThreadEvent(participantId, itemId, {
    type: 'thread_closed',
    byUserId: userId,
  });
  const followers = await forumTable.getFollowers(participantId, itemId);
  const connectionIds = followers.map(follower => follower.connectionId);
  await sendAll(connectionIds, [ threadClosedEvent ]);
};