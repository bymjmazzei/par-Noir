/**
 * Upload Queue Service
 * Manages upload tasks, progress tracking, and parallel processing
 */

import { EventEmitter } from 'events';

export type UploadTaskType = 'file' | 'textPost' | 'multiPage' | 'pdf' | 'updateShareSettings' | 'updateMetadata' | 'createCollection' | 'deleteFile' | 'bulkDelete' | 'addToFeed' | 'saveToFeed';

export type UploadTaskStatus = 'pending' | 'processing' | 'uploading' | 'completed' | 'failed' | 'cancelled';

export interface UploadMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
  tags?: string[];
  isPublic?: boolean;
  isNSFW?: boolean;
  /** When false, upload raw file without encryption (for video/audio over tier limit) */
  encrypt?: boolean;
  [key: string]: any;
}

export interface UploadTask {
  id: string;
  type: UploadTaskType;
  file?: File;
  textPost?: any;
  pages?: any[]; // For multi-page thoughts
  accountId: string;
  metadata?: UploadMetadata;
  status: UploadTaskStatus;
  progress: number; // 0-100
  error?: string;
  result?: {
    fileId?: string;
    thumbnailFileId?: string;
    thumbnailShareToken?: any;
    [key: string]: any;
  };
  createdAt: number;
  updatedAt: number;
  onProgress?: (progress: number) => void;
  onComplete?: (result: any) => void;
  onError?: (error: Error) => void;
}

export interface QueueProgress {
  total: number;
  pending: number;
  processing: number;
  uploading: number;
  completed: number;
  failed: number;
  overallProgress: number; // 0-100
}

export class UploadQueueService extends EventEmitter {
  private static instance: UploadQueueService;
  private queue: Map<string, UploadTask> = new Map();
  private processingTasks: Set<string> = new Set();
  private maxConcurrency: number = 3; // Process up to 3 uploads in parallel
  private isProcessing: boolean = false;

  private constructor() {
    super();
    // Ensure .off() method exists (fallback for polyfills that might not have it)
    // Node.js EventEmitter.off() was added in v10.0.0, but browser polyfills may not include it
    if (typeof this.off !== 'function') {
      this.off = this.removeListener.bind(this);
    }
  }

  static getInstance(): UploadQueueService {
    if (!UploadQueueService.instance) {
      UploadQueueService.instance = new UploadQueueService();
    }
    return UploadQueueService.instance;
  }

  /**
   * Add task to queue
   */
  addTask(task: Omit<UploadTask, 'id' | 'status' | 'progress' | 'createdAt' | 'updatedAt'>): string {
    const id = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const uploadTask: UploadTask = {
      ...task,
      id,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.queue.set(id, uploadTask);
    this.emit('taskAdded', uploadTask);
    this.emit('queueChanged', this.getQueueProgress());
    
    // Start processing if not already running
    this.processQueue();

    return id;
  }

  /**
   * Get task by ID
   */
  getTask(id: string): UploadTask | undefined {
    return this.queue.get(id);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): UploadTask[] {
    return Array.from(this.queue.values());
  }

  /**
   * Get active tasks (pending, processing, uploading)
   */
  getActiveTasks(): UploadTask[] {
    return Array.from(this.queue.values()).filter(
      task => ['pending', 'processing', 'uploading'].includes(task.status)
    );
  }

  /**
   * Update task status
   */
  updateTaskStatus(id: string, status: UploadTaskStatus, error?: string): void {
    const task = this.queue.get(id);
    if (!task) return;

    task.status = status;
    task.updatedAt = Date.now();
    if (error) {
      task.error = error;
    }

    this.emit('taskUpdated', task);
    this.emit('queueChanged', this.getQueueProgress());

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      this.processingTasks.delete(id);
      task.onComplete && status === 'completed' && task.onComplete(task.result);
      task.onError && (status === 'failed' || status === 'cancelled') && task.onError(new Error(error || 'Task failed'));
    }
  }

  /**
   * Update task progress
   */
  updateTaskProgress(id: string, progress: number): void {
    const task = this.queue.get(id);
    if (!task) return;

    task.progress = Math.max(0, Math.min(100, progress));
    task.updatedAt = Date.now();

    if (task.onProgress) {
      task.onProgress(task.progress);
    }

    this.emit('taskProgress', { id, progress });
    this.emit('queueChanged', this.getQueueProgress());
  }

  /**
   * Set task result
   */
  setTaskResult(id: string, result: any): void {
    const task = this.queue.get(id);
    if (!task) return;

    task.result = result;
    task.updatedAt = Date.now();

    this.emit('taskUpdated', task);
  }

  /**
   * Cancel task
   */
  cancelTask(id: string): boolean {
    const task = this.queue.get(id);
    if (!task) return false;

    if (task.status === 'pending' || task.status === 'processing' || task.status === 'uploading') {
      this.updateTaskStatus(id, 'cancelled', 'Cancelled by user');
      this.processingTasks.delete(id);
      return true;
    }

    return false;
  }

  /**
   * Remove completed/failed tasks older than specified time
   */
  cleanupOldTasks(maxAge: number = 3600000): void { // Default: 1 hour
    const now = Date.now();
    const toRemove: string[] = [];

    this.queue.forEach((task, id) => {
      if ((task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') &&
          (now - task.updatedAt) > maxAge) {
        toRemove.push(id);
      }
    });

    toRemove.forEach(id => this.queue.delete(id));
    
    if (toRemove.length > 0) {
      this.emit('queueChanged', this.getQueueProgress());
    }
  }

  /**
   * Get queue progress summary
   */
  getQueueProgress(): QueueProgress {
    const tasks = Array.from(this.queue.values());
    const total = tasks.length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const processing = tasks.filter(t => t.status === 'processing').length;
    const uploading = tasks.filter(t => t.status === 'uploading').length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;

    // Calculate overall progress (weighted average)
    let totalProgress = 0;
    tasks.forEach(task => {
      totalProgress += task.progress;
    });
    const overallProgress = total > 0 ? Math.round(totalProgress / total) : 0;

    return {
      total,
      pending,
      processing,
      uploading,
      completed,
      failed,
      overallProgress
    };
  }

  /**
   * Process queue (internal)
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.processingTasks.size < this.maxConcurrency) {
        // Find next pending task
        const pendingTask = Array.from(this.queue.values()).find(
          task => task.status === 'pending' && !this.processingTasks.has(task.id)
        );

        if (!pendingTask) {
          break; // No more pending tasks
        }

        this.processingTasks.add(pendingTask.id);
        this.updateTaskStatus(pendingTask.id, 'processing');

        // Process task (will be handled by uploadProcessor)
        // The processor will call updateTaskStatus/updateTaskProgress
        this.emit('taskReady', pendingTask);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Notify that a task has finished processing (so we can start next one)
   */
  notifyTaskFinished(id: string): void {
    this.processingTasks.delete(id);
    this.processQueue();
  }

  /**
   * Set max concurrency
   */
  setMaxConcurrency(max: number): void {
    this.maxConcurrency = Math.max(1, max);
    this.processQueue();
  }

  /**
   * Clear all tasks
   */
  clear(): void {
    this.queue.clear();
    this.processingTasks.clear();
    this.emit('queueChanged', this.getQueueProgress());
  }
}

export const uploadQueueService = UploadQueueService.getInstance();

// Auto-cleanup old tasks every 10 minutes
setInterval(() => {
  uploadQueueService.cleanupOldTasks();
}, 600000);

