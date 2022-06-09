import { dynamodb } from '../dynamodb';
import { extractTokenData, getConnectionId } from '../parsers';
import type { SocketHandler } from '../utils/types';
import { send } from './messages';
import { ForumTable } from './table';

const forumTable = new ForumTable(dynamodb);
const seconds = 1;
const minutes = 60 * seconds;
const hours = 60 * minutes;
/**
 * ttl is the TimeToLive value of the db entry expressed in seconds.
 */
export const followTtl = 12 * hours;

export const handler: SocketHandler = async event => {
  const connectionId = getConnectionId(event);
  const tokenData = extractTokenData(event);
  const { participantId, itemId, userId } = tokenData;

  await forumTable.addThreadEvent(participantId, itemId, {
    type: 'follow',
    connectionId,
    ttl: followTtl,
    userId,
  });

  const events = await forumTable.getThreadEvents(participantId, itemId, { limit: 20, asc: false });
  await send(connectionId, events);
};