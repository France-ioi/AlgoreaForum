import { dynamodb } from '../dynamodb';
import { TokenData } from '../utils/parsers';
import { WSClient } from '../websocket-client';
import { ForumTable } from './table';

const forumTable = new ForumTable(dynamodb);
const seconds = 1;
const minutes = 60 * seconds;
const hours = 60 * minutes;
/**
 * ttl is the TimeToLive value of the db entry expressed in seconds.
 */
export const followTtl = 12 * hours;

export async function follow(wsClient: WSClient, token: TokenData): Promise<void> {
  const { participantId, itemId, userId } = token;

  const [ followers, events ] = await Promise.all([
    forumTable.getFollowers({ itemId, participantId }),
    forumTable.getThreadEvents({ participantId, itemId, limit: 19, asc: false }),
  ]);
  const followEvent = await forumTable.addThreadEvent(participantId, itemId, {
    eventType: 'follow',
    connectionId: wsClient.connectionId,
    ttl: followTtl,
    userId,
  });

  await Promise.all([
    wsClient.send(wsClient.connectionId, [ followEvent, ...events ]),
    wsClient.sendAll(
      followers.map(({ connectionId }) => connectionId),
      [ followEvent ],
    ),
  ]);

}
