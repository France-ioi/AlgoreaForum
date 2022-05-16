import type { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import AWS from 'aws-sdk'

const dynamo = new AWS.DynamoDB.DocumentClient({
  region: 'localhost',
  endpoint: 'http://localhost:7000',
});
const peersTableName = 'peersTable'

const getConnectionId = (event: APIGatewayProxyEvent) => {
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

interface Peer {
  connectionId: string,
  status: 'ASSISTANT_FREE' | 'ASSISTANT_BUSY' | 'TRAINEE_WAITING' | 'TRAINEE_BUSY',
}
const isPeer = (data: any): data is Peer => data && typeof data === 'object' && typeof data.connectionId === 'string' &&
  typeof data.status === 'string' && ['ASSISTANT_FREE', 'ASSISTANT_BUSY', 'TRAINEE_WAITING', 'TRAINEE_BUSY'].includes(data.status);

export type Message =
  | { type: 'waiting-trainees', peers: Peer[] }
  | { type: 'trainee-status-change', trainee: Peer } // used to update trainee or assistant status in UI.
  | { type: 'assistant-disconnected', assistant: Peer }
  | { type: 'trainee-disconnected', trainee: Peer }
  | { type: 'help-offer', assistant: Peer }
  | { type: 'accept-offer', trainee: Peer }
  | { type: 'reject-offer', trainee: Peer }
  | { type: 'help-ended' } // sent to trainees when assistants end the process. Might be reused for other purposes later on.
  // | { type: '' }
;

export const handleConnection: APIGatewayProxyHandler = async (event) => {
  const as = event.queryStringParameters?.as
  console.info('handle connection', { as });
  if (as !== 'trainee' && as !== 'assistant') return { statusCode: 400, body: '"as" query parameter is required, expected "assistant" or "trainee"' }
  try {
    return as === 'assistant'
      ? await registerAvailableAssistant(event)
      : await registerWaitingTrainee(event)
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error }) }
  }
};

const registerAvailableAssistant = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const peers = new Peers(dynamo);
  const connectionId = getConnectionId(event)
  await peers.add({ connectionId, status: 'ASSISTANT_FREE' })
  const waitingTrainees = await peers.getByStatus('TRAINEE_WAITING')

  setTimeout(() => {
    send(connectionId, { type: 'waiting-trainees', peers: waitingTrainees });
  }, 1);
  return { statusCode: 200, body: JSON.stringify({ type: 'assistant' }) }
};

const registerWaitingTrainee = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const peers = new Peers(dynamo);
  await peers.add({ connectionId: getConnectionId(event), status: 'TRAINEE_WAITING' });
  const [waitingTrainees, freeAssistants] = await Promise.all([
    peers.getByStatus('TRAINEE_WAITING'),
    peers.getByStatus('ASSISTANT_FREE'),
  ])
  console.info('free assistants', { freeAssistants, waitingTrainees })
  await Promise.all(freeAssistants.map((assistant) => {
    return send(assistant.connectionId, { type: 'waiting-trainees', peers: waitingTrainees })
  }));
  return { statusCode: 200, body: JSON.stringify({ type: 'trainee' }) };
};

export const handleDisconnection: APIGatewayProxyHandler = async (event) => {
  console.info('handle disconnection');
  const peers = new Peers(dynamo);
  const peer = await peers.get(getConnectionId(event));
  const isTrainee = peer.status === 'TRAINEE_BUSY' || peer.status === 'TRAINEE_WAITING';
  return isTrainee
    ? handleTraineeDisconnection(peers, peer)
    : handleAssistantDisconnection(peers, peer)
};
  
const handleAssistantDisconnection = async (peers: Peers, assistant: Peer): Promise<APIGatewayProxyResult> => {
  const [busyTrainees] = await Promise.all([
    peers.getByStatus('TRAINEE_BUSY'),
    peers.delete(assistant.connectionId),
  ]);
  await sendAll(busyTrainees.map((trainee) => trainee.connectionId), { type: 'assistant-disconnected', assistant })
  return { statusCode: 204, body: '' };
};

const handleTraineeDisconnection = async (peers: Peers, trainee: Peer): Promise<APIGatewayProxyResult> => {
  const [busyAssistants, freeAssistants] = await Promise.all([
    peers.getByStatus('ASSISTANT_BUSY'),
    peers.getByStatus('ASSISTANT_FREE'),
    peers.delete(trainee.connectionId),
  ]);
  const recipients =  [...busyAssistants, ...freeAssistants].map((peer) => peer.connectionId);
  await sendAll(recipients, { type: 'trainee-disconnected', trainee });
  return { statusCode: 204, body: '' };
};

export const assistantOffersHelp: APIGatewayProxyHandler = async (event) => {
  const peers = new Peers(dynamo)
  const { trainee } = getPayload(event);
  if (!isPeer(trainee)) return { statusCode: 400, body: 'trainee must be a peer with a status and a connection id' };

  const assistant = await peers.get(getConnectionId(event));
  await send(trainee.connectionId, { type: 'help-offer', assistant })
  return { statusCode: 204, body: '' };
};

export const traineeRejectsHelpOffer: APIGatewayProxyHandler = async (event) => {
  const { assistant } = getPayload(event);
  if (!isPeer(assistant)) return { statusCode: 400, body: 'assistant must be a peer' };
  const peers = new Peers(dynamo);
  const trainee = await peers.get(getConnectionId(event));
  await send(assistant.connectionId, { type: 'reject-offer', trainee });
  return { statusCode: 204, body: '' };
}

export const traineeAcceptsHelpOffer: APIGatewayProxyHandler = async (event) => {
  const peers = new Peers(dynamo);
  const { assistant } = getPayload(event);
  if (!isPeer(assistant)) return { statusCode: 400, body: 'assistant must be a peer with a status and a connection id' };
  const traineeConnectionId = getConnectionId(event);
  await Promise.all([
    peers.update(assistant.connectionId, 'ASSISTANT_BUSY'),
    peers.update(traineeConnectionId, 'TRAINEE_BUSY'),
  ]);
  const [freeAssistants, updatedTrainee] = await Promise.all([
    peers.getByStatus('ASSISTANT_FREE'),
    peers.get(traineeConnectionId),
  ]);
  const recipients = freeAssistants.map((peer) => peer.connectionId);
  await Promise.all([
    sendAll(recipients, { type: 'trainee-status-change', trainee: updatedTrainee }),
    send(assistant.connectionId, { type: 'accept-offer', trainee: updatedTrainee }),
  ])
  
  return { statusCode: 204, body: '' }
}

export const traineeEndsHelp: APIGatewayProxyHandler = async (event) => {
  const peers = new Peers(dynamo);
  const { assistant } = getPayload(event);
  if (!isPeer(assistant)) return { statusCode: 400, body: 'trainee must be a peer with a status and a connection id' };

  await peers.update(assistant.connectionId, 'ASSISTANT_FREE');
  return { statusCode: 204, body: '' };
};

export const assistantEndsHelp: APIGatewayProxyHandler = async (event) => {
  const peers = new Peers(dynamo);
  const { trainee } = getPayload(event);
  if (!isPeer(trainee)) return { statusCode: 400, body: 'trainee must be a peer with a status and a connection id' };
  const assistantConnectionId = getConnectionId(event);

  // const [waitingTrainees] = await Promise.all([
  //   peers.delete(trainee.connectionId).then(() => peers.getByStatus('TRAINEE_WAITING')),
  //   peers.update(assistantConnectionId, 'ASSISTANT_FREE'),
  // ]);
  await peers.update(assistantConnectionId, 'ASSISTANT_FREE');
  // await send(assistantConnectionId, { type: 'waiting-trainees', peers: waitingTrainees });
  await send(trainee.connectionId, { type: 'help-ended' })

  return { statusCode: 204, body: '' };
};

const send = async (connectionId: string, message: Message): Promise<void> => {
  const gatewayApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: 'http://localhost:3001',
  });
  console.info('API versions:', gatewayApi.apiVersions)
  console.info('[message] to', connectionId, message)
  await gatewayApi.postToConnection({
    ConnectionId: connectionId,
    Data: JSON.stringify(message),
  }).promise();
}

const sendAll = async (connectionIds: string[], message: Message): Promise<void> => {
  await Promise.all(connectionIds.map((connectionId) => send(connectionId, message)))
}


class Peers {
  constructor(private dynamo: AWS.DynamoDB.DocumentClient) {}

  async add(peer: Peer) {
    await this.dynamo.put({
      TableName: peersTableName,
      Item: {
        connectionId: peer.connectionId,
        status: peer.status,
        ttl: 42, // for now
      },
    }).promise();
  }

  async update(connectionId: string, status: Peer['status']) {
    await this.dynamo.update({
      TableName: peersTableName,
      Key: { connectionId },
      AttributeUpdates: {
        status: { Value: status }
      }
    }).promise();
  }

  async delete(connectionId: string) {
    await this.dynamo.delete({
      TableName: peersTableName,
      Key: { connectionId },
    }).promise();
  }

  async getByStatus(status: Peer['status']): Promise<Peer[]> {
    const result = await this.dynamo.scan({
      TableName: peersTableName,
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
      FilterExpression: '#status = :status',
    }).promise();
    return (result.Items ?? []) as Peer[];
  }
  async get(connectionId: string): Promise<Peer> {
    const result = await this.dynamo.get({
      TableName: peersTableName,
      Key: { connectionId },
    }).promise();
    if (!result.Item) throw new Error(`peer "${connectionId}" not found`)
    return (result.Item) as Peer;
  }
}
