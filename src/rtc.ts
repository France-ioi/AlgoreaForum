import { APIGatewayProxyHandler } from 'aws-lambda'
import AWS from 'aws-sdk'

const dynamo = new AWS.DynamoDB.DocumentClient({
  region: 'localhost',
  endpoint: 'http://localhost:8000',
});
const rtcTableName = 'rtcTable'

export const addPeer: APIGatewayProxyHandler = async (event) => {
  const { connectionId } = event.requestContext
  if (!connectionId) return { statusCode: 401, body: '' }
  try {
    const result = await dynamo.put({
      TableName: rtcTableName,
      Item: {
        connectionId,
      },
    }).promise();
    console.info('created:', result);
  
    return { statusCode: 204, body: '' }
  } catch (error) {
    console.error(error)
    return { statusCode: 500, body: '' }
  }
};

export const removePeer: APIGatewayProxyHandler = async (event) => {
  const { connectionId } = event.requestContext
  if (!connectionId) return { statusCode: 401, body: '' }

  const result = await dynamo.delete({
    TableName: rtcTableName,
    Key: {
      connectionId,
    },
  }).promise();
  console.info('deleted:', result)

  return { statusCode: 204, body: '' }
};

export const sendOfferToConnectedPeers: APIGatewayProxyHandler = async (event) => {
  return {
    statusCode: 200,
    body: 'send offer to connected peers',
  };
};

export const notifyDisconnect: APIGatewayProxyHandler = async (event) => {
  return {
    statusCode: 200,
    body: 'Disconnected.',
  }
};

export const answerToOffer: APIGatewayProxyHandler = async (event) => {
  if (!event.body) return { statusCode: 400, body: '' }
  
  const result = await dynamo.scan({
    TableName: rtcTableName,
  }).promise();
  console.info('answer to offer', result);
  console.info('event.body');

  return {
    statusCode: 200,
    body: 'answer to offer',
  };
};

export const acceptAnswer: APIGatewayProxyHandler = async (event) => {
    return {
    statusCode: 200,
    body: 'accept answer',
  };
};
