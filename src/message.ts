import AWS from 'aws-sdk';
import type { Peer } from './db/peers';

export type Message =
  | { type: 'waiting-trainees', peers: Peer[] }
  | { type: 'trainee-status-change', trainee: Peer } // used to update trainee or assistant status in UI.
  | { type: 'assistant-disconnected', assistant: Peer }
  | { type: 'trainee-disconnected', trainee: Peer }
  | { type: 'help-offer', assistant: Peer }
  | { type: 'accept-offer', trainee: Peer }
  | { type: 'reject-offer', trainee: Peer }
  | { type: 'help-ended' }; // sent to trainees when assistants end the process. Might be reused for other purposes later on.

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
