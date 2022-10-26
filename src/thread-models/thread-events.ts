import { ForumTable } from '../forum-table';
import { Thread } from './thread';
import * as D from 'io-ts/Decoder';
import { decodeOrNull } from '../utils/decode';
import { isNotNull } from '../utils/predicates';

const dbThreadEventDecoder = D.struct({
  time: D.number,
  label: D.string,
  data: D.UnknownRecord,
});

interface ThreadEvent {
  thread: Thread,
  time: number,

  label: string,
  data: unknown,
}

export class ThreadEvents extends ForumTable {

  /**
   * Insert multiple thread events
   * ! They must have different timestamp values !
   */
  async insert(events: ThreadEvent[]): Promise<void> {
    await this.batchUpdate(events.map(event => {
      const { thread, ...e } = event;
      return { ...e, pk: this.pk(thread) };
    }));
  }

  async getAll(thread: Thread): Promise<ThreadEvent[]> {
    const results = await this.sqlRead({
      query: `SELECT "time", label, data FROM ${this.tableName} WHERE pk = ? ORDER BY "time" DESC`,
      params: [ this.pk(thread) ],
      limit: 20,
    });
    return results
      .map(decodeOrNull(dbThreadEventDecoder))
      .filter(isNotNull)
      .map(e => ({ ...e, thread }));
  }

  private pk(thread: Thread): string {
    return `THREAD#${thread.participantId}#${thread.itemId}#EVENTS`;
  }
}
