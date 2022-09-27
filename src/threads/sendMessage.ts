import { dynamodb } from '../dynamodb';
import { TokenData } from '../utils/parsers';
import { ForumTable } from './table';
import { decode2 } from '../utils/decode';
import * as D from 'io-ts/Decoder';
import { WSClient } from '../websocket-client';

const forumTable = new ForumTable(dynamodb);

export async function sendMessage(wsClient: WSClient, token: TokenData, payload: unknown): Promise<void> {
  const { participantId, itemId, userId } = token;

  const message = decode2(D.struct({ message: D.string }))(payload).message;

  const [ followers, createdEvent ] = await Promise.all([
    forumTable.getFollowers({ participantId, itemId }),
    forumTable.addThreadEvent(participantId, itemId, { eventType: 'message', userId, content: message }),
  ]);
  const connectionIds = followers.map(follower => follower.connectionId);
  await wsClient.sendAll(connectionIds, [ createdEvent ]);
}
