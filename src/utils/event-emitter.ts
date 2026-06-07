type EventCallback<T = unknown> = (data: T) => void;

export class EventEmitter<TEvents extends { [K in keyof TEvents]: unknown }> {
    #listeners: Map<keyof TEvents, Set<EventCallback>> = new Map();

    on<K extends keyof TEvents>(event: K, callback: EventCallback<TEvents[K]>): () => void {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, new Set());
        }
        this.#listeners.get(event)!.add(callback as EventCallback);

        return () => {
            this.#listeners.get(event)?.delete(callback as EventCallback);
        };
    }

    once<K extends keyof TEvents>(event: K, callback: EventCallback<TEvents[K]>): () => void {
        const unsubscribe = this.on(event, (data) => {
            unsubscribe();
            callback(data);
        });
        return unsubscribe;
    }

    emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
        const callbacks = this.#listeners.get(event);
        if (callbacks) {
            for (const callback of callbacks) {
                callback(data);
            }
        }
    }

    off<K extends keyof TEvents>(event: K, callback?: EventCallback<TEvents[K]>): void {
        if (callback) {
            this.#listeners.get(event)?.delete(callback as EventCallback);
        } else {
            this.#listeners.delete(event);
        }
    }

    removeAllListeners(): void {
        this.#listeners.clear();
    }
}
