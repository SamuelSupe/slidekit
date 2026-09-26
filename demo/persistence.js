import { uid } from '../src/document.js';

export async function openStorage() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('slidekit-playground', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('本地存储暂时不可用'));
  });
  let revision;
  let loaded = false;
  return {
    read: () => new Promise((resolve, reject) => {
      loaded = false;
      const transaction = db.transaction('documents');
      const store = transaction.objectStore('documents');
      const document = store.get('current');
      const version = store.get('revision');
      transaction.oncomplete = () => {
        revision = version.result;
        loaded = true;
        resolve(document.result);
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('读取已中断'));
    }),
    write: doc => new Promise((resolve, reject) => {
      if (!loaded) { reject(new Error('请先成功读取本地存档')); return; }
      const transaction = db.transaction('documents', 'readwrite');
      const store = transaction.objectStore('documents');
      const version = store.get('revision');
      const nextRevision = uid();
      let conflict;
      // Comparing and writing in the same transaction prevents an older tab
      // (including its pagehide handler) from replacing a newer saved deck.
      version.onsuccess = () => {
        if (version.result !== revision) {
          conflict = Object.assign(new Error('文稿已在其他标签页更新，请先导出 JSON，再重新加载'), { name: 'StorageConflictError' });
          transaction.abort();
          return;
        }
        store.put(doc, 'current');
        store.put(nextRevision, 'revision');
      };
      transaction.oncomplete = () => { revision = nextRevision; resolve(); };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(conflict || transaction.error || new Error('保存已中断'));
    }),
    close: () => db.close(),
  };
}
