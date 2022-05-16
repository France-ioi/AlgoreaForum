import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda'
import AWS from 'aws-sdk'

const dynamo = new AWS.DynamoDB.DocumentClient({
  region: 'localhost',
  endpoint: 'http://localhost:7000',
});
const rtcTableName = 'rtcTable'

const getPeerId = (event: APIGatewayProxyEvent) => {
  const id = event.requestContext.connectionId
  if (!id) throw { statusCode: 400, body: 'A connection id is required' }
  return id
}
const getPayload = (event: APIGatewayProxyEvent): Record<string, any> => {
  try {
    if (!event.body) throw new Error()
    return JSON.parse(event.body)
  } catch (e) {
    throw { statusCode: 400, body: 'A payload is required' }
  }
}

export type Message =
  | { type: 'peers', peerIds: string[] }
  | { type: 'offer', offer: any, fromPeerId: string }
  | { type: 'answer', answer: any, fromPeerId: string }
  | { type: 'ice-candidate', iceCandidate: any, fromPeerId: string };

const send = async (event: APIGatewayProxyEvent, peerId: string, message: Message): Promise<void> => {
  const gatewayApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: 'http://localhost:3001',
  });
  console.info('API versions:', gatewayApi.apiVersions)
  console.info('[message] to', peerId, message)
  await gatewayApi.postToConnection({
    ConnectionId: peerId,
    Data: JSON.stringify(message),
  }).promise();
}

export const connectionHandler: APIGatewayProxyHandler = async (event) => {
  const newPeerId = getPeerId(event)
  try {
    const peers = await dynamo.scan({
      TableName: rtcTableName,
      AttributesToGet: ['peerId'],
    }).promise();

    await dynamo.put({
      TableName: rtcTableName,
      Item: {
        peerId: newPeerId,
      },
    }).promise();
    const peerIds = peers.Items?.map((item) => item.peerId) ?? [];

    setTimeout(() => {
      send(event, newPeerId, { type: 'peers', peerIds })
    }, 100);
    return { statusCode: 204, body: '' }
  } catch (error) {
    console.error('Caught', error)
    return { statusCode: 500, body: '' }
  }
};

export const disconnectionHandler: APIGatewayProxyHandler = async (event) => {
  const peerId = getPeerId(event)

  await dynamo.delete({
    TableName: rtcTableName,
    Key: {
      peerId,
    },
  }).promise();

  return { statusCode: 204, body: '' }
};

// export const sendConnectedPeers: APIGatewayProxyHandler = async (event) => {
//   const peerId = getPeerId(event);
//   const peers = await dynamo.scan({
//     TableName: rtcTableName,
//     AttributesToGet: ['peerId'],
//   }).promise();
//   return { statusCode: 200 }
// }

export const forwardOffer: APIGatewayProxyHandler = async (event) => {
  const fromPeerId = getPeerId(event);
  const { offer, toPeerId } = getPayload(event);
  if (!offer || !toPeerId) return { statusCode: 400, body: 'Payload properties "offer" and "toPeerId" are required' }
  
  await send(event, toPeerId, { type: 'offer', offer, fromPeerId })
  return { statusCode: 204, body: '' };
};

export const forwardAnswer: APIGatewayProxyHandler = async (event) => {
  const fromPeerId = getPeerId(event);
  const { answer, toPeerId } = getPayload(event);
  if (!answer || !toPeerId) return { statusCode: 400, body: 'Payload properties "answer" and "toPeerId" are required' }
  
  await send(event, toPeerId, { type: 'answer', fromPeerId, answer })
  return { statusCode: 204, body: '' }
};

export const forwardIceCandidate: APIGatewayProxyHandler = async (event) => {
  const fromPeerId = getPeerId(event);
  const { iceCandidate, toPeerId } = getPayload(event);
  if (!iceCandidate || !toPeerId) return { statusCode: 400, body: 'Payload properties "iceCandidate" and "toPeerId" are required' }
  
  await send(event, toPeerId, { type: 'ice-candidate', fromPeerId, iceCandidate })
  return { statusCode: 204, body: '' };
};
