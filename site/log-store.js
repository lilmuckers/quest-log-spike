// Arrival log shared by sw.js (importScripts) and the page (classic script). IndexedDB, because
// Cache Storage writes from the push handler didn't show up on iOS.
self.spikeLog = (() => {
  const open = () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open('spike-log', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('arrivals', { autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('arrivals', mode);
      const out = fn(t.objectStore('arrivals'));
      t.oncomplete = () => (db.close(), resolve(out.result ?? out));
      t.onerror = () => (db.close(), reject(t.error));
    });
  };
  return {
    add: (entry) => tx('readwrite', (s) => s.add(entry)),
    all: () => tx('readonly', (s) => s.getAll()),
  };
})();
