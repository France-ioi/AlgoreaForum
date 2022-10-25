import { ForumTable } from '../forum-table';
import { Thread } from './thread';

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

  private pk(thread: Thread): string {
    return `THREAD#${thread.participantId}#${thread.itemId}#EVENTS`;
  }
}
