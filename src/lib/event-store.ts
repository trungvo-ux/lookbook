import type { EventStore, StreamId, EventId } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/**
 * Minimal in-memory event store for Streamable HTTP resumability.
 * Fine for a single Node process; replace with Redis/etc for multi-instance.
 */
export class InMemoryEventStore implements EventStore {
  private events = new Map<
    string,
    { streamId: StreamId; message: JSONRPCMessage }
  >();

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const eventId = `${streamId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    this.events.set(eventId, { streamId, message });
    // Cap memory
    if (this.events.size > 5000) {
      const first = this.events.keys().next().value;
      if (first) this.events.delete(first);
    }
    return eventId;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    {
      send,
    }: {
      send: (eventId: EventId, message: JSONRPCMessage) => Promise<void>;
    },
  ): Promise<StreamId> {
    if (!lastEventId) {
      throw new Error("Event ID is required for replay");
    }
    const last = this.events.get(lastEventId);
    if (!last) {
      throw new Error(`Event ${lastEventId} not found`);
    }
    const streamId = last.streamId;
    let found = false;
    for (const [eventId, entry] of this.events.entries()) {
      if (entry.streamId !== streamId) continue;
      if (eventId === lastEventId) {
        found = true;
        continue;
      }
      if (found) {
        await send(eventId, entry.message);
      }
    }
    return streamId;
  }
}
