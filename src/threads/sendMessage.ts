import type { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamodb } from '../dynamodb';
import { badRequest, ok, serverError, unauthorized } from '../utils/responses';
import { sendAll } from './messages';
import { extractTokenData, getPayload } from '../utils/parsers';
import { ForumTable } from './table';
import { decode } from '../utils/decode';
import * as D from 'io-ts/Decoder';

const forumTable = new ForumTable(dynamodb);

export const handler: APIGatewayProxyHandler = async event => {
  if (!event.requestContext.connectionId) return badRequest();

  const tokenData = extractTokenData(event);
  if (!tokenData) return unauthorized();
  const { participantId, itemId, userId } = tokenData;

  const payload = decode(D.struct({ message: D.string }))(getPayload(event));
  if (!payload || !payload.message) return badRequest();

  try {
    const [ followers, createdEvent ] = await Promise.all([
      forumTable.getFollowers({ participantId, itemId }),
      forumTable.addThreadEvent(participantId, itemId, { eventType: 'message', userId, content: payload.message }),
    ]);
    const connectionIds = followers.map(follower => follower.connectionId);
    await sendAll(connectionIds, [ createdEvent ]);

    return ok();
  } catch {
    return serverError();
  }
};