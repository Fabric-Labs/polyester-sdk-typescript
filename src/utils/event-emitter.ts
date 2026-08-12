type EventCallback<T = unknown> = (data: T) => void;

/**
 * Minimal typed event emitter used by SDK services to publish auth and lifecycle state changes.
 */
export class EventEmitter<TEvents extends { [K in keyof TEvents]: unknown }> {
    #listeners: Map<keyof TEvents, Set<EventCallback>> = new Map();

    /**
     * Registers an event listener and returns an unsubscribe function.
     */
    on<K extends keyof TEvents>(event: K, callback: EventCallback<TEvents[K]>): () => void {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, new Set());
        }
        this.#listeners.get(event)!.add(callback as EventCallback);

        return () => {
            this.#listeners.get(event)?.delete(callback as EventCallback);
        };
    }

    /**
     * Registers an event listener that runs at most once.
     */
    once<K extends keyof TEvents>(event: K, callback: EventCallback<TEvents[K]>): () => void {
        const unsubscribe = this.on(event, (data) => {
            unsubscribe();
            callback(data);
        });
        return unsubscribe;
    }

    /**
     * Emits an event to all registered listeners, isolating errors thrown synchronously by each listener.
     */
    emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
        const callbacks = this.#listeners.get(event);
        if (callbacks) {
            for (const callback of callbacks) {
                try {
                    callback(data);
                } catch {
                    // A consumer callback must not interrupt the SDK operation or other listeners.
                }
            }
        }
    }

    /**
     * Removes a previously registered event listener.
     */
    off<K extends keyof TEvents>(event: K, callback?: EventCallback<TEvents[K]>): void {
        if (callback) {
            this.#listeners.get(event)?.delete(callback as EventCallback);
        } else {
            this.#listeners.delete(event);
        }
    }

    /**
     * Removes every registered event listener.
     */
    removeAllListeners(): void {
        this.#listeners.clear();
    }
}
