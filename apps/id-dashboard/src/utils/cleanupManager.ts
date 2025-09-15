// Cleanup Manager for preventing memory leaks
type CleanupFunction = () => void;
type CleanupGroup = 'timers' | 'listeners' | 'subscriptions' | 'workers' | 'storage';

class CleanupManager {
  private cleanupFunctions: Map<CleanupGroup, CleanupFunction[]> = new Map();
  private isDestroyed = false;

  constructor() {
    // Initialize cleanup groups
    this.cleanupFunctions.set('timers', []);
    this.cleanupFunctions.set('listeners', []);
    this.cleanupFunctions.set('subscriptions', []);
    this.cleanupFunctions.set('workers', []);
    this.cleanupFunctions.set('storage', []);
  }

  // Add cleanup function to a specific group
  addCleanup(group: CleanupGroup, cleanupFn: CleanupFunction): void {
    if (this.isDestroyed) {
      // If already troyed, execute cleanup immediately
      cleanupFn();
      return;
    }

    const groupCleanups = this.cleanupFunctions.get(group);
    if (groupCleanups) {
      groupCleanups.push(cleanupFn);
    }
  }

  // Add timer cleanup
  addTimer(timerId: NodeJS.Timeout | number): void {
    this.addCleanup('timers', () => {
      if (typeof timerId === 'number') {
        clearTimeout(timerId);
        clearInterval(timerId);
      } else {
        clearTimeout(timerId);
        clearInterval(timerId);
      }
    });
  }

  // Add event listener cleanup
  addEventListener(
    target: EventTarget,
    event: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.addCleanup('listeners', () => {
      target.removeEventListener(event, listener, options);
    });
  }

  // Add subscription cleanup
  addSubscription(subscription: { unsubscribe: () => void }): void {
    this.addCleanup('subscriptions', () => {
      subscription.unsubscribe();
    });
  }

  // Add worker cleanup
  addWorker(worker: Worker): void {
    this.addCleanup('workers', () => {
      worker.terminate();
    });
  }

  // Add storage cleanup
  addStorageCleanup(cleanupFn: () => void): void {
    this.addCleanup('storage', cleanupFn);
  }

  // Clean up a specific group
  cleanupGroup(group: CleanupGroup): void {
    const groupCleanups = this.cleanupFunctions.get(group);
    if (groupCleanups) {
      groupCleanups.forEach(cleanupFn => {
        try {
          cleanupFn();
        } catch (error) {
          // Console statement removed for production
        }
      });
      groupCleanups.length = 0;
    }
  }

  // Clean up all groups
  cleanupAll(): void {
    if (this.isDestroyed) return;

    this.isDestroyed = true;

    for (const [group, cleanups] of this.cleanupFunctions) {
      cleanups.forEach(cleanupFn => {
        try {
          cleanupFn();
        } catch (error) {
          // Console statement removed for production
        }
      });
      cleanups.length = 0;
    }
  }

  // Get cleanup count for a group
  getCleanupCount(group: CleanupGroup): number {
    const groupCleanups = this.cleanupFunctions.get(group);
    return groupCleanups ? groupCleanups.length : 0;
  }

  // Get total cleanup count
  getTotalCleanupCount(): number {
    let total = 0;
    for (const cleanups of this.cleanupFunctions.values()) {
      total += cleanups.length;
    }
    return total;
  }

  // Check if manager is troyed
  isManagerDestroyed(): boolean {
    return this.isDestroyed;
  }

  // Reset manager (useful for testing)
  reset(): void {
    this.isDestroyed = false;
    for (const cleanups of this.cleanupFunctions.values()) {
      cleanups.length = 0;
    }
  }
}

// React hook for using cleanup manager
export const useCleanupManager = (): CleanupManager => {
  const manager = new CleanupManager();
  
  // Clean up when component unmounts
  // Note: This hook should be used in React components
  // The cleanup will be handled by the component's useEffect
  
  return manager;
};

// Export the main class
export { CleanupManager };
