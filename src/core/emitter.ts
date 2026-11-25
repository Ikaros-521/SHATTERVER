type Listener = (payload: never) => void;

/**
 * Minimal typed event bus.
 *
 * The simulation emits intent ("a brick died here") and never knows how it is presented;
 * rendering, audio and the HUD each subscribe to the same events.
 */
export class Emitter<E> {
  private readonly listeners = new Map<keyof E, Set<Listener>>();

  on<K extends keyof E>(type: K, listener: (payload: E[K]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener);
    return () => this.off(type, listener);
  }

  off<K extends keyof E>(type: K, listener: (payload: E[K]) => void): void {
    this.listeners.get(type)?.delete(listener as Listener);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    // Iterate a copy: listeners are allowed to unsubscribe while an event is dispatching.
    for (const listener of [...set]) listener(payload as never);
  }

  clear(): void {
    this.listeners.clear();
  }
}
