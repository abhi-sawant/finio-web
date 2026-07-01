const DB_NAME = 'finio-backup';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'directory';
const BACKUP_FILENAME_PATTERN = /^finio-backup-(\d{4}-\d{2}-\d{2})\.json$/;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isFolderPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFolderPickerSupported()) return null;
  const handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
  return handle ?? null;
}

export async function chooseBackupFolder(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({
    id: 'finio-backup-folder',
    mode: 'readwrite',
    startIn: 'downloads',
  });
  await handle.requestPermission({ mode: 'readwrite' });
  await idbSet(HANDLE_KEY, handle);
  return handle;
}

export async function clearBackupFolder(): Promise<void> {
  await idbDelete(HANDLE_KEY);
}

export async function hasWritePermission(
  handle: FileSystemDirectoryHandle,
  { prompt }: { prompt: boolean },
): Promise<boolean> {
  const descriptor: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
  const state = await handle.queryPermission(descriptor);
  if (state === 'granted') return true;
  if (state === 'prompt' && prompt) {
    return (await handle.requestPermission(descriptor)) === 'granted';
  }
  return false;
}

export async function writeBackupAndRotate(
  handle: FileSystemDirectoryHandle,
  filename: string,
  contents: string,
  keep = 10,
): Promise<void> {
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();

  const backups: { name: string; date: string }[] = [];
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file') continue;
    const match = BACKUP_FILENAME_PATTERN.exec(entry.name);
    if (match) backups.push({ name: entry.name, date: match[1] });
  }
  backups.sort((a, b) => b.date.localeCompare(a.date));
  for (const stale of backups.slice(keep)) {
    await handle.removeEntry(stale.name);
  }
}
