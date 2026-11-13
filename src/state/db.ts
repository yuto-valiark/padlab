// Tiny promise wrapper around IndexedDB (projects + their audio).

const DB_NAME = 'padlab';
const VERSION = 1;

let dbp: Promise<IDBDatabase> | null = null;

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const wrap = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function store(name: 'projects' | 'audio', mode: IDBTransactionMode) {
  return (await open()).transaction(name, mode).objectStore(name);
}

export const db = {
  get: async <T>(s: 'projects' | 'audio', key: IDBValidKey) => wrap<T | undefined>((await store(s, 'readonly')).get(key)),
  all: async <T>(s: 'projects' | 'audio') => wrap<T[]>((await store(s, 'readonly')).getAll()),
  put: async (s: 'projects' | 'audio', value: unknown, key?: IDBValidKey) => wrap((await store(s, 'readwrite')).put(value, key)),
  del: async (s: 'projects' | 'audio', key: IDBValidKey | IDBKeyRange) => wrap((await store(s, 'readwrite')).delete(key)),
  keys: async (s: 'projects' | 'audio', range?: IDBKeyRange) => wrap((await store(s, 'readonly')).getAllKeys(range)),
};
