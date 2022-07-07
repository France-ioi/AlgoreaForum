import type { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamodb } from '../dynamodb';
import { extractTokenData } from '../utils/parsers';
import { badRequest, ok, serverError, unauthorized } from '../utils/responses';
import { sendAll } from './messages';
import { ForumTable } from './table';

const forumTable = new ForumTable(dynamodb);

export const handler: APIGatewayProxyHandler = async event => {
  if (!event.requestContext.connectionId) return badRequest('connectionId is required');
  const tokenData = extractTokenData(event);
  if (!tokenData) return unauthorized();
  const { participantId, itemId, userId } = tokenData;

  try {
    const [ followEvent ] = await forumTable.getFollowers({
      participantId,
      itemId,
      limit: 1,
      filters: { userId, connectionId: event.requestContext.connectionId },
    });

    if (!followEvent) return ok();

    await forumTable.removeThreadEvent(followEvent);
    const followers = await forumTable.getFollowers({ participantId, itemId });
    await sendAll(
      followers.map(follower => follower.connectionId),
      [{ ...followEvent, eventType: 'unfollow' }],
    );

    return ok();
  } catch {
    return serverError();
  }
};