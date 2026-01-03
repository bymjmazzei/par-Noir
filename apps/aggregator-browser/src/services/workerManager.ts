/**
 * Worker Manager Service
 * Manages Web Worker lifecycle, pooling, and provides async API
 */

interface WorkerRequest {
  id: string;
  type: string;
  [key: string]: any;
}

interface WorkerResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
}

type WorkerType = 'encryption' | 'thumbnail';

class WorkerManager {
  private static instance: WorkerManager;
  private encryptionWorker: Worker | null = null;
  private thumbnailWorker: Worker | null = null;
  private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }> = new Map();
  private requestIdCounter = 0;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): WorkerManager {
    if (!WorkerManager.instance) {
      WorkerManager.instance = new WorkerManager();
    }
    return WorkerManager.instance;
  }

  /**
   * Initialize encryption worker
   */
  private async getEncryptionWorker(): Promise<Worker> {
    if (!this.encryptionWorker) {
      try {
        // Use dynamic import for worker
        const workerUrl = new URL('../workers/upload.worker.ts', import.meta.url);
        this.encryptionWorker = new Worker(workerUrl, { type: 'module' });
        this.setupWorkerHandlers(this.encryptionWorker);
      } catch (error) {
        console.error('Failed to create encryption worker:', error);
        throw new Error('Encryption worker unavailable');
      }
    }
    return this.encryptionWorker;
  }

  /**
   * Initialize thumbnail worker
   */
  private async getThumbnailWorker(): Promise<Worker> {
    if (!this.thumbnailWorker) {
      try {
        const workerUrl = new URL('../workers/thumbnail.worker.ts', import.meta.url);
        this.thumbnailWorker = new Worker(workerUrl, { type: 'module' });
        this.setupWorkerHandlers(this.thumbnailWorker);
      } catch (error) {
        console.error('Failed to create thumbnail worker:', error);
        throw new Error('Thumbnail worker unavailable');
      }
    }
    return this.thumbnailWorker;
  }

  /**
   * Setup message handlers for worker
   */
  private setupWorkerHandlers(worker: Worker): void {
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pendingRequests.get(response.id);
      
      if (pending) {
        this.pendingRequests.delete(response.id);
        if (response.success) {
          pending.resolve(response.result);
        } else {
          pending.reject(new Error(response.error || 'Worker operation failed'));
        }
      }
    });

    worker.addEventListener('error', (error) => {
      console.error('Worker error:', error);
      // Reject all pending requests for this worker
      this.pendingRequests.forEach((pending, id) => {
        pending.reject(new Error('Worker error occurred'));
      });
      this.pendingRequests.clear();
    });
  }

  /**
   * Send request to worker and wait for response
   */
  private async sendToWorker(workerType: WorkerType, request: WorkerRequest): Promise<any> {
    const worker = workerType === 'encryption' 
      ? await this.getEncryptionWorker()
      : await this.getThumbnailWorker();

    return new Promise((resolve, reject) => {
      const id = `req_${++this.requestIdCounter}_${Date.now()}`;
      request.id = id;

      this.pendingRequests.set(id, { resolve, reject });

      // Set timeout for request (30 seconds)
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Worker request timeout'));
        }
      }, 30000);

      // Override resolve to clear timeout
      const originalResolve = this.pendingRequests.get(id)!.resolve;
      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          originalResolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      // Send request to worker
      if (request.type === 'encrypt' && request.data instanceof Uint8Array) {
        // Transfer ArrayBuffer for efficiency
        worker.postMessage(request, [request.data.buffer]);
      } else {
        worker.postMessage(request);
      }
    });
  }

  /**
   * Encrypt data using worker
   */
  async encrypt(data: Uint8Array, pnId: string, publicKey: string): Promise<{ encrypted: string; iv: string; salt: string }> {
    try {
      return await this.sendToWorker('encryption', {
        type: 'encrypt',
        data,
        pnId,
        publicKey
      });
    } catch (error) {
      console.error('Encryption worker error:', error);
      throw error;
    }
  }

  /**
   * Decrypt data using worker
   */
  async decrypt(encrypted: string, iv: string, salt: string, pnId: string, publicKey: string): Promise<Uint8Array> {
    try {
      const result = await this.sendToWorker('encryption', {
        type: 'decrypt',
        encrypted,
        iv,
        salt,
        pnId,
        publicKey
      });
      // Convert array back to Uint8Array
      return new Uint8Array(result);
    } catch (error) {
      console.error('Decryption worker error:', error);
      throw error;
    }
  }

  /**
   * Render text post to blob using worker
   */
  async renderTextPost(textPost: any, scale: number = 1.0): Promise<Blob> {
    try {
      const result = await this.sendToWorker('thumbnail', {
        type: 'renderTextPost',
        textPost,
        scale
      });
      // Convert ArrayBuffer to Blob
      return new Blob([result], { type: 'image/png' });
    } catch (error) {
      console.error('Thumbnail worker error:', error);
      throw error;
    }
  }

  /**
   * Create image thumbnail using worker
   */
  async createImageThumbnail(imageData: ArrayBuffer, maxWidth: number, maxHeight: number): Promise<Blob> {
    try {
      const result = await this.sendToWorker('thumbnail', {
        type: 'createImageThumbnail',
        imageData,
        maxWidth,
        maxHeight
      });
      // Convert ArrayBuffer to Blob
      return new Blob([result], { type: 'image/jpeg' });
    } catch (error) {
      console.error('Image thumbnail worker error:', error);
      throw error;
    }
  }

  /**
   * Terminate all workers (cleanup)
   */
  terminate(): void {
    if (this.encryptionWorker) {
      this.encryptionWorker.terminate();
      this.encryptionWorker = null;
    }
    if (this.thumbnailWorker) {
      this.thumbnailWorker.terminate();
      this.thumbnailWorker = null;
    }
    // Reject all pending requests
    this.pendingRequests.forEach((pending) => {
      pending.reject(new Error('Worker terminated'));
    });
    this.pendingRequests.clear();
  }
}

export const workerManager = WorkerManager.getInstance();

