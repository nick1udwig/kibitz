/**
 * Service to handle screen wake lock functionality
 */
class WakeLockService {
  private wakeLock: WakeLockSentinel | null = null;
  private isSupported: boolean = false;

  constructor() {
    this.isSupported = typeof navigator !== 'undefined' &&
      'wakeLock' in navigator &&
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
        navigator.userAgent.toLowerCase()
      );
  }

  /**
   * Acquire wake lock
   */
  async acquire(): Promise<void> {
    if (!this.isSupported) return;

    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      console.log('Screen wake lock acquired');
    } catch (err) {
      console.warn('Failed to acquire wake lock:', err);
    }
  }

  /**
   * Release wake lock
   */
  async release(): Promise<void> {
    if (!this.wakeLock) return;

    try {
      await this.wakeLock.release();
      this.wakeLock = null;
      console.log('Screen wake lock released');
    } catch (err) {
      console.warn('Failed to release wake lock:', err);
    }
  }

  /**
   * Check if wake lock is currently active
   */
  isActive(): boolean {
    return this.wakeLock !== null;
  }
}

export const wakeLock = new WakeLockService();