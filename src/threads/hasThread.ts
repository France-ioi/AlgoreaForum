import type { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamodb } from '../dynamodb';
import { badRequest, ok, serverError, unauthorized } from '../utils/responses';
import { send } from './messages';
import { extractTokenData } from '../utils/parsers';
import { ForumTable, ThreadEvent } from './table';

const forumTable = new ForumTable(dynamodb);

export const handler: APIGatewayProxyHandler = async event => {
  if (!event.requestContext.connectionId) return badRequest();

  const tokenData = extractTokenData(event);
  if (!tokenData) return unauthorized();
  const { participantId, itemId } = tokenData;

  try {
    const [ [ threadOpened ], [ threadClosed ] ] = await Promise.all([
      forumTable.getThreadEvents({ participantId, itemId, asc: false, limit: 1, filters: { eventType: 'thread_opened' } }),
      forumTable.getThreadEvents({ participantId, itemId, asc: false, limit: 1, filters: { eventType: 'thread_closed' } }),
    ]);

    await send(event.requestContext.connectionId, [{ status: getThreadStatus(threadOpened, threadClosed) }]);

    return ok();
  } catch {
    return serverError();
  }
};

export type ThreadStatus = 'none' | 'closed' | 'opened';

function getThreadStatus(threadOpenedEvent?: ThreadEvent, threadClosedEvent?: ThreadEvent): ThreadStatus {
  if (!threadOpenedEvent && !threadClosedEvent) return 'none';
  const threadOpenedTime = threadOpenedEvent?.time || 0;
  if (!threadClosedEvent || threadClosedEvent.time < threadOpenedTime) return 'opened';
  return 'closed';
}