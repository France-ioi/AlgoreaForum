import type { SocketHandler } from '../utils/types';
import { ForumTable } from './table';
import { extractTokenData, getConnectionId } from '../parsers';
import { dynamodb } from '../dynamodb';
import { sendAll } from './messages';
import { followTtl } from './follow';

const forumTable = new ForumTable(dynamodb);

export const handler: SocketHandler = async event => {
  const tokenData = extractTokenData(event);
  const { participantId, itemId, userId, isMine, canWatchParticipant } = tokenData;

  if (!isMine && !canWatchParticipant) throw new Error('cannot open thread');

  const [ threadOpenedEvent ]= await Promise.all([
    forumTable.addThreadEvent(participantId, itemId, {
      type: 'thread_opened',
      byUserId: userId,
    }),
    forumTable.addThreadEvent(participantId, itemId, {
      type: 'follow',
      ttl: followTtl,
      connectionId: getConnectionId(event),
      userId,
    })
  ]);
  const followers = await forumTable.getFollowers(participantId, itemId);
  const connectionIds = followers.map(follower => follower.connectionId);
  await sendAll(connectionIds, [ threadOpenedEvent ]);
};
