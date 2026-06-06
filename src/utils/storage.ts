export function getStorageItem<T>(key: string): T | null {
	if (typeof localStorage === "undefined") return null;

	try {
		const item = localStorage.getItem(key);
		if (!item) return null;

		try {
			return JSON.parse(item) as T;
		} catch {
			return item as T;
		}
	} catch {
		return null;
	}
}

export function setStorageItem<T>(key: string, value: T): void {
	if (typeof localStorage === "undefined") return;

	try {
		if (typeof value === "string") {
			localStorage.setItem(key, value);
		} else {
			localStorage.setItem(key, JSON.stringify(value));
		}
	} catch {
		// storage full or unavailable
	}
}

export function clearStorageItem(key: string): void {
	if (typeof localStorage === "undefined") return;

	try {
		localStorage.removeItem(key);
	} catch {
		// unavailable
	}
}

export interface IndexedDbStorage {
	get<T>(key: string): Promise<T | undefined>;
	set<T>(key: string, value: T): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
}

interface CreateIndexedDbStorageOptions {
	dbName: string;
	storeName: string;
}

function openDatabase({ dbName, storeName }: CreateIndexedDbStorageOptions): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === "undefined") {
			reject(new Error("IndexedDB not available"));
			return;
		}

		const request = indexedDB.open(dbName, 1);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(storeName)) {
				db.createObjectStore(storeName);
			}
		};
	});
}

export function createIndexedDbStorage(opts: CreateIndexedDbStorageOptions): IndexedDbStorage {
	return {
		async get<T>(key: string): Promise<T | undefined> {
			try {
				const db = await openDatabase(opts);
				return new Promise((resolve, reject) => {
					const tx = db.transaction(opts.storeName, "readonly");
					const store = tx.objectStore(opts.storeName);
					const request = store.get(key);

					request.onerror = () => reject(request.error);
					request.onsuccess = () => resolve(request.result as T | undefined);

					tx.oncomplete = () => db.close();
				});
			} catch {
				return undefined;
			}
		},

		async set<T>(key: string, value: T): Promise<void> {
			try {
				const db = await openDatabase(opts);
				return new Promise((resolve, reject) => {
					const tx = db.transaction(opts.storeName, "readwrite");
					const store = tx.objectStore(opts.storeName);
					const request = store.put(value, key);

					request.onerror = () => reject(request.error);
					request.onsuccess = () => resolve();

					tx.oncomplete = () => db.close();
				});
			} catch {
				// ignore
			}
		},

		async delete(key: string): Promise<void> {
			try {
				const db = await openDatabase(opts);
				return new Promise((resolve, reject) => {
					const tx = db.transaction(opts.storeName, "readwrite");
					const store = tx.objectStore(opts.storeName);
					const request = store.delete(key);

					request.onerror = () => reject(request.error);
					request.onsuccess = () => resolve();

					tx.oncomplete = () => db.close();
				});
			} catch {
				// ignore
			}
		},

		async clear(): Promise<void> {
			try {
				const db = await openDatabase(opts);
				return new Promise((resolve, reject) => {
					const tx = db.transaction(opts.storeName, "readwrite");
					const store = tx.objectStore(opts.storeName);
					const request = store.clear();

					request.onerror = () => reject(request.error);
					request.onsuccess = () => resolve();

					tx.oncomplete = () => db.close();
				});
			} catch {
				// ignore
			}
		},
	};
}

export async function deleteSelectedOriginDatabases(selectedNames: string[] = []): Promise<void> {
	if (typeof indexedDB === "undefined") return;

	try {
		const dbs = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];

		if (dbs && dbs.length > 0) {
			await Promise.all(
				dbs
					.filter((d) => d.name && selectedNames.includes(d.name))
					.map((d) => {
						const name = d.name as string;
						console.warn("[deleteSelectedOriginDatabases] Deleting DB:", name);
						return indexedDB.deleteDatabase(name);
					})
			);
			return;
		}

		await Promise.all(
			selectedNames.map((name) => {
				try {
					console.warn("[deleteSelectedOriginDatabases] Fallback delete DB:", name);
					return indexedDB.deleteDatabase(name);
				} catch {
					return Promise.resolve();
				}
			})
		);
	} catch (err) {
		console.warn("[deleteSelectedOriginDatabases] Failed to remove DBs:", err);
	}
}
