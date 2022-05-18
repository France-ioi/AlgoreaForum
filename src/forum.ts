import type { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { isPeer, Peer, peersTable } from './db/peers';
import { disconnect, send, sendAll } from './message'
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
  const connectionId = getConnectionId(event);
  await peersTable.add({ connectionId, is: 'assistant', involvedWith: null });

  // The server needs to return a response before being able to send messages to a peer
  // For that reason, the `send` instruction is deferred, scheduled right after the function return
  setTimeout(() => {
    sendWaitingTraineesToFreeAssistants().catch();
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
  await peersTable.add({ connectionId: getConnectionId(event), is: 'trainee', involvedWith: null });
  await sendWaitingTraineesToFreeAssistants();
  return { statusCode: 200, body: JSON.stringify({ type: 'trainee' }) };
};

/**
 * Acts as a proxy to handle disconnection of a trainee or an assistant.
 */
export const handleDisconnection: APIGatewayProxyHandler = async (event) => {
  try {
    const peer = await peersTable.get(getConnectionId(event));
    return peer.is === 'trainee'
      ? handleTraineeDisconnection(peer)
      : handleAssistantDisconnection(peer)
  } catch (err) {
    // Peer does not exist, and it's fine.
    return { statusCode: 204, body: '' };
  }
};

/**
 * When an assistant gets disconnected, we:
 * - Remove him/her from the peers db
 * - Send all busy trainees the information so that if one is concerned, s-he will start again the help process with someone else
 */
const handleAssistantDisconnection = async (assistant: Peer): Promise<APIGatewayProxyResult> => {
  await peersTable.delete(assistant);
  if (!assistant.involvedWith) return { statusCode: 204, body: '' };

  // If a busy assistant got disconnected, its trainee waits again for help so we should:
  // - notify free assistants with new awaiting trainees
  // - notify the trainee s-he is not being helped anymore
  await Promise.all([
    send(assistant.involvedWith, { type: 'assistant-disconnected', assistant }),
    sendWaitingTraineesToFreeAssistants(),
  ]);
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
  await peersTable.delete(trainee);
  if (trainee.involvedWith) {
    const waitingTrainees = await peersTable.getAwaitingTrainees();
    // tacitly, the client-side will know the assistant is available when receiving a "waiting-trainees" message
    await send(trainee.involvedWith, { type: 'waiting-trainees', trainees: waitingTrainees });
  } else {
    // If the trainee was waiting for help, notify free assistant thatr s-he is not waiting anymore
    await sendWaitingTraineesToFreeAssistants();
  }
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

  await peersTable.updateInvolvedWith(assistant, traineeConnectionId)
  // since a trainee ahs been given help, he does not wait anymore. Thus, notify free assistants.
  const promiseInBg = sendWaitingTraineesToFreeAssistants();

  const trainee = await peersTable.get(traineeConnectionId);
  await Promise.all([
    // notify the assistant the trainee accepted his/her help.
    send(assistant.connectionId, { type: 'accept-offer', trainee }),
    promiseInBg,
  ])
  
  return { statusCode: 204, body: '' };
}

/**
 * When an assistant ends the help process, it means s-he considers the help effective. In that case we:
 * - Notify the trainee that the help process ended, on his/her side it will trigger a disconnection of the trainee.
 * - Reset assistant status to free/available
 * - Notify the assistant of the trainees awaiting help
 */
export const assistantEndsHelp: APIGatewayProxyHandler = async (event) => {
  const { trainee } = getPayload(event);
  if (!isPeer(trainee)) return { statusCode: 400, body: 'trainee must be a peer with a status and a connection id' };
  
  const [assistant, waitingTrainees] = await Promise.all([
    peersTable.get(getConnectionId(event)),
    peersTable.getAwaitingTrainees(),
    peersTable.delete(trainee),
  ]);

  await Promise.all([
    disconnect(trainee.connectionId),
    send(assistant.connectionId, { type: 'waiting-trainees', trainees: waitingTrainees }),
  ]);

  return { statusCode: 204, body: '' };
};

const sendWaitingTraineesToFreeAssistants = async () => {
  const [trainees, assistants] = await Promise.all([
    peersTable.getAwaitingTrainees(),
    peersTable.getFreeAssistants(),
  ]);
  await sendAll(assistants.map((peer) => peer.connectionId), { type: 'waiting-trainees', trainees });
}
