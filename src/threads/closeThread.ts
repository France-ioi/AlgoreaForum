import { dynamodb } from '../dynamodb';
import { extractTokenData } from '../parsers';
import type { SocketHandler } from '../utils/types';
import { ForumTable } from './table';

const forumTable = new ForumTable(dynamodb);

export const handler: SocketHandler = async event => {
  const tokenData = extractTokenData(event);
  const { participantId, itemId, userId } = tokenData;

  await forumTable.addThreadEvent(participantId, itemId, {
    type: 'thread_closed',
    byUserId: userId,
  });
};