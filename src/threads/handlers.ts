import type { APIGatewayProxyHandler } from 'aws-lambda';
import { ForumTable } from './table';
import { extractTokenData } from '../parsers';
import { dynamodb } from '../dynamodb';

const forumTable = new ForumTable(dynamodb);

export const openThread: APIGatewayProxyHandler = async event => {
  try {
    const tokenData = extractTokenData(event);
    const { participantId, itemId, userId } = tokenData;

    await forumTable.addThreadEvent(participantId, itemId, {
      type: 'thread_opened',
      byUserId: userId,
    });

    return { statusCode: 201, body: '' };
  } catch (error) {
    return { statusCode: 401, body: '' }; // user is unauthenticated
  }
};
