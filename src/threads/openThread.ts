import type { SocketHandler } from '../utils/types';
import { ForumTable } from './table';
import { extractTokenData } from '../parsers';
import { dynamodb } from '../dynamodb';

const forumTable = new ForumTable(dynamodb);

export const handler: SocketHandler = async event => {
  const tokenData = extractTokenData(event);
  const { participantId, itemId, userId, isMine, canWatchParticipant } = tokenData;

  if (!isMine && !canWatchParticipant) throw new Error('cannot open thread');

  await forumTable.addThreadEvent(participantId, itemId, {
    type: 'thread_opened',
    byUserId: userId,
  });
};
