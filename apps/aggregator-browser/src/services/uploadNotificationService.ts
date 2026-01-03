/**
 * Upload Notification Service
 * Provides toast notifications and background upload alerts
 */

import { uploadQueueService, UploadTask } from './uploadQueueService';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  taskId?: string;
  duration?: number;
  timestamp: number;
}

class UploadNotificationService {
  private static instance: UploadNotificationService;
  private notifications: Map<string, Notification> = new Map();
  private listeners: Set<(notifications: Notification[]) => void> = new Set();

  private constructor() {
    this.setupQueueListeners();
  }

  static getInstance(): UploadNotificationService {
    if (!UploadNotificationService.instance) {
      UploadNotificationService.instance = new UploadNotificationService();
    }
    return UploadNotificationService.instance;
  }

  /**
   * Setup listeners for queue events
   */
  private setupQueueListeners(): void {
    uploadQueueService.on('taskUpdated', (task: UploadTask) => {
      if (task.status === 'completed') {
        this.showSuccess(`Upload completed: ${this.getTaskName(task)}`);
      } else if (task.status === 'failed') {
        this.showError(`Upload failed: ${this.getTaskName(task)}`, task.error);
      }
    });

    // Show notification when all uploads complete
    uploadQueueService.on('queueChanged', (progress) => {
      if (progress.total > 0 && progress.completed === progress.total && progress.failed === 0) {
        // All uploads completed successfully
        this.showSuccess(`All ${progress.total} upload${progress.total > 1 ? 's' : ''} completed`);
      }
    });
  }

  /**
   * Get task display name
   */
  private getTaskName(task: UploadTask): string {
    if (task.file) {
      return task.file.name;
    }
    if (task.textPost) {
      const content = task.textPost.content || '';
      return content.replace(/<[^>]*>/g, '').substring(0, 30) || 'Thought';
    }
    if (task.pages && task.pages.length > 0) {
      return `Multi-page thought (${task.pages.length} pages)`;
    }
    return 'Upload';
  }

  /**
   * Show success notification
   */
  showSuccess(message: string, duration: number = 3000): void {
    this.addNotification({
      type: 'success',
      message,
      duration
    });
  }

  /**
   * Show error notification
   */
  showError(message: string, error?: string, duration: number = 5000): void {
    const fullMessage = error ? `${message}: ${error}` : message;
    this.addNotification({
      type: 'error',
      message: fullMessage,
      duration
    });
  }

  /**
   * Show info notification
   */
  showInfo(message: string, duration: number = 3000): void {
    this.addNotification({
      type: 'info',
      message,
      duration
    });
  }

  /**
   * Show warning notification
   */
  showWarning(message: string, duration: number = 4000): void {
    this.addNotification({
      type: 'warning',
      message,
      duration
    });
  }

  /**
   * Add notification
   */
  private addNotification(notification: Omit<Notification, 'id' | 'timestamp'>): void {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullNotification: Notification = {
      ...notification,
      id,
      timestamp: Date.now()
    };

    this.notifications.set(id, fullNotification);
    this.notifyListeners();

    // Auto-remove after duration
    if (notification.duration && notification.duration > 0) {
      setTimeout(() => {
        this.removeNotification(id);
      }, notification.duration);
    }
  }

  /**
   * Remove notification
   */
  removeNotification(id: string): void {
    this.notifications.delete(id);
    this.notifyListeners();
  }

  /**
   * Get all notifications
   */
  getNotifications(): Notification[] {
    return Array.from(this.notifications.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Subscribe to notification changes
   */
  subscribe(listener: (notifications: Notification[]) => void): () => void {
    this.listeners.add(listener);
    // Immediately call with current notifications
    listener(this.getNotifications());

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    const notifications = this.getNotifications();
    this.listeners.forEach(listener => {
      try {
        listener(notifications);
      } catch (error) {
        console.error('Notification listener error:', error);
      }
    });
  }

  /**
   * Clear all notifications
   */
  clear(): void {
    this.notifications.clear();
    this.notifyListeners();
  }
}

export const uploadNotificationService = UploadNotificationService.getInstance();

