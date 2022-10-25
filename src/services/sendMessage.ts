import { dynamodb } from '../dynamodb';
import { TokenData } from '../utils/parsers';
import { Threads } from '../thread-models/thread-events';
import { decode2 } from '../utils/decode';
import * as D from 'io-ts/Decoder';
import { invalidConnectionIds, logSendResults, WSClient } from '../websocket-client';
import { cleanupConnections } from '../cleanup';
import { ThreadSubscriptions } from '../thread-models/thread-subscriptions';

const subscriptions = new ThreadSubscriptions(dynamodb);
const threads = new Threads(dynamodb);

export async function sendMessage(wsClient: WSClient, token: TokenData, payload: unknown): Promise<void> {
  const { participantId, itemId, userId } = token;

  const message = decode2(D.struct({ message: D.string }))(payload).message;

  const [ subscribers, createdEvent ] = await Promise.all([
    subscriptions.getSubscribers({ participantId, itemId }),
    threads.addThreadEvent(participantId, itemId, { eventType: 'message', userId, content: message }),
  ]);
  const connectionIds = subscribers.map(subscriber => subscriber.connectionId);
  const sendResults = await wsClient.sendAll(connectionIds, [ createdEvent ]);
  logSendResults(sendResults);
  await cleanupConnections(participantId, itemId, invalidConnectionIds(sendResults));
}
