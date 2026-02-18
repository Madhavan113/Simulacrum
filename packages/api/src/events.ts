export interface ApiEvent<TPayload = unknown> {
  type: string;
  payload: TPayload;
  timestamp: string;
}

export type ApiEventListener = (event: ApiEvent) => void;

export interface ApiEventBus {
  publish: <TPayload = unknown>(type: string, payload: TPayload) => ApiEvent<TPayload>;
  subscribe: (listener: ApiEventListener) => () => void;
}

export function createEventBus(): ApiEventBus {
  const listeners = new Set<ApiEventListener>();

  return {
    publish(type, payload) {
      const event: ApiEvent<typeof payload> = {
        type,
        payload,
        timestamp: new Date().toISOString()
      };

      for (const listener of listeners) {
        listener(event);
      }

      return event;
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    }
  };
}
