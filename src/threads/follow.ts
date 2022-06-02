import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamodb } from '../dynamodb';
import { extractTokenData, getConnectionId } from '../parsers';
import { send } from './messages';
import { ForumTable } from './table';

const forumTable = new ForumTable(dynamodb);
const seconds = 1;
const minutes = 60 * seconds;
const hours = 60 * minutes;

export const handler: APIGatewayProxyHandler = async event => {
  try {
    const connectionId = getConnectionId(event);
    const tokenData = extractTokenData(event);
    const { participantId, itemId, userId } = tokenData;

    await forumTable.addThreadEvent(participantId, itemId, {
      type: 'subscribe',
      connectionId,
      ttl: 12 * hours, // in seconds
      userId,
    });

    const events = await forumTable.getThreadEvents(participantId, itemId, { limit: 20, asc: false });
    await send(connectionId, events);

    return { statusCode: 201, body: '' };
  } catch (error) {
    return { statusCode: 401, body: '' }; // user is unauthenticated
  }
};