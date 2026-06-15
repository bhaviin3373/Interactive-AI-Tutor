import { SyncMetric } from './types';

type SyncCallback = (queue: SyncMetric[], isOnline: boolean) => void;

class StudyMetricsSyncManager {
  private queue: SyncMetric[] = [];
  private listeners: Set<SyncCallback> = new Set();
  private isOnlineStatus: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private syncInProgress = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.loadQueue();
      this.isOnlineStatus = navigator.onLine;

      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
      
      // Perform initial sync if we are online on startup
      if (this.isOnlineStatus) {
        setTimeout(() => this.syncAllPending(), 1500);
      }
    }
  }

  private loadQueue() {
    try {
      const saved = localStorage.getItem('study_offline_metrics_queue');
      if (saved) {
        this.queue = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load study metrics offline queue:', e);
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem('study_offline_metrics_queue', JSON.stringify(this.queue));
    } catch (e) {
      console.error('Failed to save study metrics offline queue:', e);
    }
  }

  private handleNetworkChange(online: boolean) {
    this.isOnlineStatus = online;
    this.notifyListeners();
    if (online) {
      console.log('Network connected. Pushing study metrics queue to backend...');
      this.syncAllPending();
    } else {
      console.log('Network disconnected. Study metrics queue running in offline-local mode.');
    }
  }

  public subscribe(cb: SyncCallback): () => void {
    this.listeners.add(cb);
    // Initial call
    cb([...this.queue], this.isOnlineStatus);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb([...this.queue], this.isOnlineStatus));
  }

  public getQueue(): SyncMetric[] {
    return [...this.queue];
  }

  public isOnline(): boolean {
    return this.isOnlineStatus;
  }

  /**
   * Queue a new study metric payload. If online, will attempt immediate sync.
   */
  public async queueMetric(metricData: Omit<SyncMetric, 'id' | 'status' | 'timestamp'>) {
    const newMetric: SyncMetric = {
      ...metricData,
      id: `m_${crypto.randomUUID()}`,
      timestamp: Date.now(),
      status: 'pending'
    };

    this.queue.push(newMetric);
    this.saveQueue();
    this.notifyListeners();

    if (this.isOnlineStatus) {
      await this.syncAllPending();
    }
  }

  /**
   * Attempt to sync all pending metrics with the backend.
   */
  public async syncAllPending() {
    if (this.syncInProgress || this.queue.length === 0) return;
    this.syncInProgress = true;

    const pendingMetrics = this.queue.filter(m => m.status === 'pending' || m.status === 'failed');
    if (pendingMetrics.length === 0) {
      this.syncInProgress = false;
      return;
    }

    // Mark current batch as syncing
    this.queue = this.queue.map(m => {
      if (m.status === 'pending' || m.status === 'failed') {
        return { ...m, status: 'syncing' as const };
      }
      return m;
    });
    this.notifyListeners();

    try {
      const response = await fetch('/api/sync-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics: pendingMetrics })
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const result = await response.json();
      const syncedIds = new Set<string>(result?.syncedIds || pendingMetrics.map(p => p.id));

      // Remove successful sync elements from the queue
      this.queue = this.queue.filter(m => !syncedIds.has(m.id));
      console.log(`Successfully synced ${syncedIds.size} study metrics to servers.`);
    } catch (err: any) {
      console.error('Failed to sync study metrics off-network:', err);
      // Revert status to failed for retry
      this.queue = this.queue.map(m => {
        if (m.status === 'syncing') {
          return { ...m, status: 'failed' as const, error: err.message || 'Sync failed' };
        }
        return m;
      });
    } finally {
      this.saveQueue();
      this.syncInProgress = false;
      this.notifyListeners();
    }
  }

  /**
   * Clear all synced and pending metrics.
   */
  public clearQueue() {
    this.queue = [];
    this.saveQueue();
    this.notifyListeners();
  }
}

export const syncManager = new StudyMetricsSyncManager();
