type EventCallback = (data: any) => void;

class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  subscribe(topic: string, callback: EventCallback): () => void {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, new Set());
    }
    this.listeners.get(topic)!.add(callback);

    return () => {
      const set = this.listeners.get(topic);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(topic);
        }
      }
    };
  }

  publish(topic: string, data: any) {
    const set = this.listeners.get(topic);
    if (set) {
      set.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in event listener for ${topic}:`, e);
        }
      });
    }

    // Also broadcast to wildcard 'all'
    if (topic !== '*') {
      const allSet = this.listeners.get('*');
      if (allSet) {
        allSet.forEach((cb) => {
          try {
            cb({ topic, ...data });
          } catch (e) {
            console.error('Error in wildcard event listener:', e);
          }
        });
      }
    }
  }
}

export const eventBus = new EventBus();
