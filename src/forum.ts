import type { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { isPeer, Peer, peersTable } from './db/peers';
import { send, sendAll } from './message'
import { getConnectionId, getPayload } from './parsers';

/**
 * Acts as a proxy between connection as "trainee" and connection as "assistant"
 * 
 * This "as" information is provided via a query parameter.
 * @example
 * const assistantSocket = new WebSocket('ws://localhost:3001/?as=assistant')
 * const traineeSocket = new WebSocket('ws://localhost:3001/?as=trainee')
 */
export const handleConnection: APIGatewayProxyHandler = async (event) => {
  const as = event.queryStringParameters?.as
  if (as !== 'trainee' && as !== 'assistant') throw new Error('"as" query parameter is required, expected "assistant" or "trainee"');
  try {
    return as === 'assistant'
      ? await handleAssistantConnection(event)
      : await handleTraineeConnection(event)
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error }) };
  }
};

/**
 * When an assistant establishes a connection, we:
 * - Add him/her to the peers in the db
 * - Mark him/her as free/available
 * - Send him/her the trainees awaiting help
 */
const handleAssistantConnection = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = getConnectionId(event)
  await peersTable.add({ connectionId, status: 'ASSISTANT_FREE' })
  const waitingTrainees = await peersTable.getByStatus('TRAINEE_WAITING')

  // The server needs to return a response before being able to send messages to a peer
  // For that reason, the `send` instruction is deferred, scheduled right after the function return
  setTimeout(() => {
    send(connectionId, { type: 'waiting-trainees', peers: waitingTrainees });
  }, 1);
  return { statusCode: 200, body: JSON.stringify({ type: 'assistant' }) }
};

/**
 * When a trainee establishes a connection, we consider it equivalent to asking help. So we:
 * - Add him/her to the peers in the db
 * - Mark him/her as waiting-for-help
 * - Send to free/available assistants a new list of trainees awaiting help
 */
const handleTraineeConnection = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  await peersTable.add({ connectionId: getConnectionId(event), status: 'TRAINEE_WAITING' });
  const [waitingTrainees, freeAssistants] = await Promise.all([
    peersTable.getByStatus('TRAINEE_WAITING'),
    peersTable.getByStatus('ASSISTANT_FREE'),
  ])
  await Promise.all(freeAssistants.map((assistant) => {
    return send(assistant.connectionId, { type: 'waiting-trainees', peers: waitingTrainees })
  }));
  return { statusCode: 200, body: JSON.stringify({ type: 'trainee' }) };
};

/**
 * Acts as a proxy to handle disconnection of a trainee or an assistant.
 */
export const handleDisconnection: APIGatewayProxyHandler = async (event) => {
  const peer = await peersTable.get(getConnectionId(event));
  const isTrainee = peer.status === 'TRAINEE_BUSY' || peer.status === 'TRAINEE_WAITING';
  return isTrainee
    ? handleTraineeDisconnection(peer)
    : handleAssistantDisconnection(peer)
};

/**
 * When an assistant gets disconnected, we:
 * - Remove him/her from the peers db
 * - Send all busy trainees the information so that if one is concerned, s-he will start again the help process with someone else
 */
const handleAssistantDisconnection = async (assistant: Peer): Promise<APIGatewayProxyResult> => {
  const [busyTrainees] = await Promise.all([
    peersTable.getByStatus('TRAINEE_BUSY'),
    peersTable.delete(assistant.connectionId),
  ]);
  await sendAll(busyTrainees.map((trainee) => trainee.connectionId), { type: 'assistant-disconnected', assistant })
  return { statusCode: 204, body: '' };
};

/**
 * When a trainee gets disconnected, we:
 * - Remove him/her from the peers db
 * - Notify all assistant that this trainee got disconnect
 *   - If the assistant was helping that trainee, s-he will end the help process and by doing receive a new list of trainees awaiting help
 *   - If the assistant was not helping him/her and is available, s-he will remove the trainee from the list of trainees awaiting help
 */
const handleTraineeDisconnection = async (trainee: Peer): Promise<APIGatewayProxyResult> => {
  const [busyAssistants, freeAssistants] = await Promise.all([
    peersTable.getByStatus('ASSISTANT_BUSY'),
    peersTable.getByStatus('ASSISTANT_FREE'),
    peersTable.delete(trainee.connectionId),
  ]);
  const recipients =  [...busyAssistants, ...freeAssistants].map((peer) => peer.connectionId);
  await sendAll(recipients, { type: 'trainee-disconnected', trainee });
  return { statusCode: 204, body: '' };
};

/**
 * When an assistant offers his/her help, forward it to the trainee.
 */
export const assistantOffersHelp: APIGatewayProxyHandler = async (event) => {
  const { trainee } = getPayload(event);
  if (!isPeer(trainee)) return { statusCode: 400, body: 'trainee must be a peer with a status and a connection id' };

  const assistant = await peersTable.get(getConnectionId(event));
  await send(trainee.connectionId, { type: 'help-offer', assistant })
  return { statusCode: 204, body: '' };
};

/**
 * When a trainee accepts help offer, we:
 * - Update the assistant & trainee status to "busy"
 * - Notify the assistant that the trainee accepted his help offer
 * - Notify remaining free assistants of the trainee's status change
 */
export const traineeAcceptsHelpOffer: APIGatewayProxyHandler = async (event) => {
  const { assistant } = getPayload(event);
  if (!isPeer(assistant)) return { statusCode: 400, body: 'assistant must be a peer with a status and a connection id' };
  const traineeConnectionId = getConnectionId(event);
  await Promise.all([
    peersTable.update(assistant.connectionId, 'ASSISTANT_BUSY'),
    peersTable.update(traineeConnectionId, 'TRAINEE_BUSY'),
  ]);
  const [freeAssistants, updatedTrainee] = await Promise.all([
    peersTable.getByStatus('ASSISTANT_FREE'),
    peersTable.get(traineeConnectionId),
  ]);
  const recipients = freeAssistants.map((peer) => peer.connectionId);
  await Promise.all([
    sendAll(recipients, { type: 'trainee-status-change', trainee: updatedTrainee }),
    send(assistant.connectionId, { type: 'accept-offer', trainee: updatedTrainee }),
  ])
  
  return { statusCode: 204, body: '' }
}

/**
 * When a trainee ends help, s-he will also disconnect right after issuing that message.
 * 
 * For that message only, we change the assistant status to free/available and do nothing more, the rest will be handled at disconnection.
 */
export const traineeEndsHelp: APIGatewayProxyHandler = async (event) => {
  const { assistant } = getPayload(event);
  if (!isPeer(assistant)) return { statusCode: 400, body: 'trainee must be a peer with a status and a connection id' };

  await peersTable.update(assistant.connectionId, 'ASSISTANT_FREE');
  return { statusCode: 204, body: '' };
};

/**
 * When an assistant ends the help process, it means s-he considers the help effective. In that case we:
 * - Notify the trainee that the help process ended, on his/her side it will trigger a disconnection of the trainee.
 * - Reset assistant status to free/available
 * - Notify the assistant of the trainees awaiting help
 */
export const assistantEndsHelp: APIGatewayProxyHandler = async (event) => {
  const { trainee } = getPayload(event);
  if (!isPeer(trainee)) return { statusCode: 400, body: 'trainee must be a peer with a status and a connection id' };
  const assistantConnectionId = getConnectionId(event);

  const [awaitingTrainees] = await Promise.all([
    peersTable.getByStatus('TRAINEE_WAITING'),
    peersTable.update(assistantConnectionId, 'ASSISTANT_FREE'),
  ]);
  await Promise.all([
    send(trainee.connectionId, { type: 'help-ended' }),
    send(assistantConnectionId, { type: 'waiting-trainees', peers: awaitingTrainees })
  ]);

  return { statusCode: 204, body: '' };
};
