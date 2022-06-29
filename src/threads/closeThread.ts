import type { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamodb } from '../dynamodb';
import { ok, serverError, unauthorized } from '../utils/responses';
import { sendAll } from './messages';
import { extractTokenData } from '../utils/parsers';
import { ForumTable } from './table';

const forumTable = new ForumTable(dynamodb);

export const handler: APIGatewayProxyHandler = async event => {
  const tokenData = extractTokenData(event);
  if (!tokenData) return unauthorized();
  const { participantId, itemId, userId } = tokenData;

  try {
    const threadClosedEvent = await forumTable.addThreadEvent(participantId, itemId, {
      eventType: 'thread_closed',
      byUserId: userId,
    });
    const followers = await forumTable.getFollowers(participantId, itemId);
    const connectionIds = followers.map(follower => follower.connectionId);
    await sendAll(connectionIds, [ threadClosedEvent ]);

    return ok();
  } catch {
    return serverError();
  }
};