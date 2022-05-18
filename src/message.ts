import AWS from 'aws-sdk';
import type { Peer } from './db/peers';

export type Message =
  | { type: 'waiting-trainees', trainees: Peer[] }
  | { type: 'assistant-disconnected', assistant: Peer }
  | { type: 'help-offer', assistant: Peer }
  | { type: 'accept-offer', trainee: Peer };

const gatewayApi = new AWS.ApiGatewayManagementApi({
  apiVersion: '2018-11-29',
  endpoint: 'http://localhost:3001',
});

export const send = async (connectionId: string, message: Message): Promise<void> => {
  await gatewayApi.postToConnection({
    ConnectionId: connectionId,
    Data: JSON.stringify(message),
  }).promise();
};

export const sendAll = async (connectionIds: string[], message: Message): Promise<void> => {
  await Promise.all(connectionIds.map((connectionId) => send(connectionId, message)))
};

export const disconnect = async (ConnectionId: string): Promise<void> => {
  await gatewayApi.deleteConnection({ ConnectionId }).promise();
};
