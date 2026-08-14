type Listener = (message: string) => void;

const listeners = new Set<Listener>();

export function toast(message: string) {
  for (const fn of listeners) fn(message);
}

export function subscribeToast(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
