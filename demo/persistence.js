export async function openStorage() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('slidekit-playground', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('本地存储暂时不可用'));
  });
  return {
    read: () => new Promise((resolve, reject) => {
      const request = db.transaction('documents').objectStore('documents').get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }),
    write: doc => new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite');
      transaction.objectStore('documents').put(doc, 'current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('保存已中断'));
    }),
    close: () => db.close(),
  };
}
