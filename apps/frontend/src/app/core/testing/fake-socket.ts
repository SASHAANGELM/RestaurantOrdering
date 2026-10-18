/** Socket boundary fake: listener accounting and explicit server/lifecycle delivery. */
export class FakeSocket {
  readonly listeners = new Map<string, Set<(payload?: unknown) => void>>();
  connects = 0;
  disconnects = 0;
  on(event: string, handler: (payload?: unknown) => void) {
    const handlers = this.listeners.get(event) ?? new Set();
    handlers.add(handler);
    this.listeners.set(event, handlers);
    return this;
  }
  off(event: string, handler: (payload?: unknown) => void) {
    this.listeners.get(event)?.delete(handler);
    return this;
  }
  connect() { this.connects++; return this; }
  disconnect() { this.disconnects++; return this; }
  receive(event: string, payload?: unknown) {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
  }
  get listenerCount() { return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0); }
}
