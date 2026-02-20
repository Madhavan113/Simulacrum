export interface ApiEvent<TPayload = unknown> {
  type: string;
  payload: TPayload;
  timestamp: string;
}

export type ApiEventListener = (event: ApiEvent) => void;

export interface ApiEventBus {
  publish: <TPayload = unknown>(type: string, payload: TPayload) => ApiEvent<TPayload>;
  subscribe: (listener: ApiEventListener) => () => void;
  recentEvents: (limit?: number) => ApiEvent[];
}

const DEFAULT_HISTORY_SIZE = 500;

export function createEventBus(historySize = DEFAULT_HISTORY_SIZE): ApiEventBus {
  const listeners = new Set<ApiEventListener>();
  const history: ApiEvent[] = [];

  return {
    publish(type, payload) {
      const event: ApiEvent<typeof payload> = {
        type,
        payload,
        timestamp: new Date().toISOString()
      };

      history.push(event);
      if (history.length > historySize) {
        history.splice(0, history.length - historySize);
      }

      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error("Event listener threw an error:", error);
        }
      }

      return event;
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    recentEvents(limit = 200) {
      const capped = Math.max(1, Math.min(limit, historySize));
      return history.slice(-capped);
    }
  };
}
