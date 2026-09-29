// A tiny event emitter. Modes use it to tell the host game what happened
// (death, score, a repair beacon) without knowing anything about the host.
export function createEmitter() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
      return () => handlers.get(name)?.delete(fn);
    },
    emit(name, payload) {
      handlers.get(name)?.forEach((fn) => fn(payload));
    },
    clear() { handlers.clear(); },
  };
}
