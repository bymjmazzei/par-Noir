// IndexedDB Manager - Handles IndexedDB operations
export class IndexedDBManager {
  private dbName = 'IdentityProtocolDB';
  private version = 1;

  /**
   * Store data in IndexedDB
   */
  async store(key: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction((['identities'], 'readwrite');
        const store = transaction.objectStore('identities');

        const storeData = {
          id: key,
          data,
          timestamp: Date.now(),
          version: '1.0'
        };

        const putRequest = store.put(storeData);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(new Error('Failed to store data in IndexedDB'));
      };
    });
  }

  /**
   * Retrieve data from IndexedDB
   */
  async retrieve(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction((['identities'], 'readonly');
        const store = transaction.objectStore('identities');

        const getRequest = store.get(key);
        getRequest.onsuccess = () => {
          if (getRequest.result) {
            resolve(getRequest.result.data);
          } else {
            reject(new Error('Data not found'));
          }
        };
        getRequest.onerror = () => reject(new Error('Failed to retrieve data from IndexedDB'));
      };
    });
  }

  /**
   * Delete data from IndexedDB
   */
  async delete(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction((['identities'], 'readwrite');
        const store = transaction.objectStore('identities');

        const deleteRequest = store.delete(key);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(new Error('Failed to delete data from IndexedDB'));
      };
    });
  }

  /**
   * Get all keys from IndexedDB
   */
  async getAllKeys(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction((['identities'], 'readonly');
        const store = transaction.objectStore('identities');

        const getAllKeysRequest = store.getAllKeys();
        getAllKeysRequest.onsuccess = () => {
          resolve(getAllKeysRequest.result as string[]);
        };
        getAllKeysRequest.onerror = () => reject(new Error('Failed to get keys from IndexedDB'));
      };
    });
  }

  /**
   * Clear IndexedDB
   */
  async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction((['identities'], 'readwrite');
        const store = transaction.objectStore('identities');

        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(new Error('Failed to clear IndexedDB'));
      };
    });
  }

  /**
   * Get IndexedDB statistics
   */
  async getStats(): Promise<{ totalSize: number; itemCount: number }> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction((['identities'], 'readonly');
        const store = transaction.objectStore('identities');

        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = () => {
          const items = getAllRequest.result;
          const totalSize = JSON.stringify(items).length;
          resolve({
            totalSize,
            itemCount: items.length
          });
        };
        getAllRequest.onerror = () => reject(new Error('Failed to get IndexedDB stats'));
      };
    });
  }
}
