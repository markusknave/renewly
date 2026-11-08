const DB_VERSION = 1;

const STORE_CONFIG = {
  subscriptions: { keyPath: 'id', autoIncrement: true },
  paymentMethods: { keyPath: 'id', autoIncrement: true },
  settings: { keyPath: 'key', autoIncrement: false },
};

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

// Resolves only after the transaction commits, so write failures are not lost.
function runStore(db, storeName, mode, action) {
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(storeName, mode);
    } catch (error) {
      reject(error);
      return;
    }

    let result;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };

    transaction.oncomplete = () => finish(resolve, result);
    transaction.onerror = () => finish(reject, transaction.error || new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => finish(reject, transaction.error || new Error('IndexedDB transaction aborted.'));

    try {
      result = action(transaction.objectStore(storeName));
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* already aborted */
      }
      finish(reject, error);
      return;
    }

    if (result && typeof result.then === 'function') {
      result.catch((error) => {
        try {
          transaction.abort();
        } catch {
          /* already aborted */
        }
        finish(reject, error);
      });
    }
  });
}

function createIdbBackend(db) {
  return {
    getAll(store) {
      return runStore(db, store, 'readonly', (objectStore) => requestResult(objectStore.getAll()));
    },
    get(store, key) {
      return runStore(db, store, 'readonly', (objectStore) => requestResult(objectStore.get(key)));
    },
    put(store, value) {
      return runStore(db, store, 'readwrite', (objectStore) => requestResult(objectStore.put(value)));
    },
    delete(store, key) {
      return runStore(db, store, 'readwrite', (objectStore) => requestResult(objectStore.delete(key))).then(() => undefined);
    },
    clear(store) {
      return runStore(db, store, 'readwrite', (objectStore) => requestResult(objectStore.clear())).then(() => undefined);
    },
  };
}

function upgradeDatabase(db) {
  for (const [name, config] of Object.entries(STORE_CONFIG)) {
    if (db.objectStoreNames.contains(name)) continue;
    db.createObjectStore(name, config.autoIncrement
      ? { keyPath: config.keyPath, autoIncrement: true }
      : { keyPath: config.keyPath });
  }
}

export async function openDb(name = 'renewly') {
  const factory = globalThis.indexedDB;
  if (!factory) throw new Error('IndexedDB is not available in this environment.');

  const request = factory.open(name, DB_VERSION);
  request.onupgradeneeded = () => upgradeDatabase(request.result);
  const db = await requestResult(request);
  db.onversionchange = () => db.close();
  return createIdbBackend(db);
}

function compareKeys(a, b) {
  const rank = (key) => (typeof key === 'number' ? 0 : typeof key === 'string' ? 1 : 2);
  const rankA = rank(a);
  const rankB = rank(b);
  if (rankA !== rankB) return rankA - rankB;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// Mirrors the IndexedDB stores in memory: same keyPaths, autoIncrement ids,
// key-ordered reads, and structured cloning of stored values.
export function createMemoryBackend() {
  const stores = new Map();
  const counters = new Map();
  for (const name of Object.keys(STORE_CONFIG)) {
    stores.set(name, new Map());
    counters.set(name, 0);
  }

  function storeFor(name) {
    const store = stores.get(name);
    if (!store) throw new Error(`Unknown object store: ${name}`);
    return store;
  }

  function nextId(name) {
    const id = counters.get(name) + 1;
    counters.set(name, id);
    return id;
  }

  return {
    async getAll(name) {
      const store = storeFor(name);
      return [...store.entries()]
        .sort((a, b) => compareKeys(a[0], b[0]))
        .map((entry) => structuredClone(entry[1]));
    },

    async get(name, key) {
      const store = storeFor(name);
      const value = store.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },

    async put(name, value) {
      const store = storeFor(name);
      const config = STORE_CONFIG[name];
      if (value === null || typeof value !== 'object') {
        throw new Error('Stored values must be objects.');
      }

      const record = structuredClone(value);
      let key = record[config.keyPath];

      if (key === undefined || key === null) {
        if (!config.autoIncrement) {
          throw new Error(`Key path "${config.keyPath}" is required.`);
        }
        key = nextId(name);
        record[config.keyPath] = key;
      } else if (config.autoIncrement && Number.isInteger(key) && key > counters.get(name)) {
        // Explicit keys advance the generator, matching IndexedDB.
        counters.set(name, key);
      }

      store.set(key, record);
      return key;
    },

    async delete(name, key) {
      storeFor(name).delete(key);
    },

    async clear(name) {
      // IndexedDB does not reset the autoIncrement generator on clear.
      storeFor(name).clear();
    },
  };
}
