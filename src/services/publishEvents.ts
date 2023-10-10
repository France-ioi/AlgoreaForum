import { TokenData } from '../utils/parsers';
import { dynamodb } from '../dynamodb';
import * as D from 'io-ts/Decoder';
import { pipe } from 'fp-ts/function';
import { decodeOrThrow } from '../utils/decode';
import { isNotNull } from '../utils/predicates';
import { Forbidden } from '../utils/errors';
import { invalidConnectionIds, logSendResults, WSClient } from '../websocket-client';
import { cleanupConnections } from '../cleanup';
import { ThreadSubscriptions } from '../thread-models/thread-subscriptions';
import { ThreadEvents } from '../thread-models/thread-events';

const subscriptions = new ThreadSubscriptions(dynamodb);
const threadEvents = new ThreadEvents(dynamodb);

const inboundThreadEventDecoder = pipe(
  D.struct({
    label: D.string,
    data: D.UnknownRecord
  }),
  D.intersect(
    D.partial({
      time: D.number,
    })
  )
);

export async function publishEvents(wsClient: WSClient, token: TokenData, payload: unknown): Promise<void> {
  const { participantId, itemId, userId, canWrite, canWatch, isMine } = token;

  if (!canWrite && !canWatch && !isMine) {
    // FIXME: this is problematic as we allow "!canWrite" to write
    // the reason is that we want to allow the user and observers to write the event log (activity started etc) in the log
    // even if the thread is closed
    throw new Forbidden(`This operation required canWrite, got ${JSON.stringify(token)} `);
  }

  // just decoce the raw structure of the payload
  const parsedPayload = decodeOrThrow(D.struct({ events: D.UnknownArray }))(payload);
  // try to decode each event, drop & log events that cannot be decoded
  const inEvents = parsedPayload.events.map(e => {
    try {
      return decodeOrThrow(inboundThreadEventDecoder)(e);
    } catch (err) {
      console.warn(`Unable to decode inbound event (${err instanceof Error ? err.message : '?'}): ${JSON.stringify(e)}`);
      return null;
    }
  }).filter(isNotNull);
  // if there is no decoded event, stop here
  if (inEvents.length === 0) return;

  // prepare events for db and output
  const events = spreadTime(inEvents.map(e => ({
    ...e,
    createdBy: userId,
    thread: { participantId, itemId },
    time: e.time ?? Date.now(),
  })));
  await Promise.all([
    subscriptions.getSubscribers({ participantId, itemId })
      .then(subs => wsClient.sendAll(subs.map(s => s.connectionId), events))
      .then(sendResults => {
        logSendResults(sendResults);
        return cleanupConnections(participantId, itemId, invalidConnectionIds(sendResults));
      }),
    threadEvents.insert(events)
  ]);
}

/**
 * Update the list in-place so that if there are, in the list, several objects with the same 'time', add '1' to some so that no 'time'
 * equals at the end. The other attributes will not be changed.
 * Side effect: the array will be sorted.
 * Return the list (which is also in-place modified)
 */
function spreadTime<T extends { time: number }>(list: T[]): T[] {
  list.sort((o1, o2) => o1.time - o2.time);
  for (let i = 1; i < list.length; i += 1) {
    if (list[i-1]?.time === list[i]?.time) list[i]!.time ++;
  }
  return list;
}