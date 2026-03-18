// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Network Collector
// ─────────────────────────────────────────────────────────────

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import type { NetworkInfo } from '../types';
import { logger } from '../core/logger';

type NetworkListener = (info: NetworkInfo) => void;

class NetworkCollector {
  private unsubscribe: (() => void) | null = null;
  private listeners: NetworkListener[] = [];
  private _current: NetworkInfo = {
    type: 'unknown',
    isConnected: false,
  };

  /**
   * Start listening to network changes.
   */
  start(): void {
    this.unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const info = this.mapState(state);
      this._current = info;
      this.listeners.forEach((cb) => cb(info));
    });
    logger.debug('Network collector started');
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.listeners = [];
  }

  addListener(cb: NetworkListener): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  get current(): NetworkInfo {
    return this._current;
  }

  /**
   * Snapshot fetch (one-time).
   */
  async fetch(): Promise<NetworkInfo> {
    const state = await NetInfo.fetch();
    this._current = this.mapState(state);
    return this._current;
  }

  private mapState(state: NetInfoState): NetworkInfo {
    let cellularGeneration: NetworkInfo['cellularGeneration'] = null;
    if (state.type === 'cellular' && state.details) {
      const gen = (state.details as any).cellularGeneration;
      if (gen) cellularGeneration = gen as NetworkInfo['cellularGeneration'];
    }

    return {
      type: this.mapType(state.type),
      isConnected: state.isConnected ?? false,
      cellularGeneration,
      isInternetReachable: state.isInternetReachable ?? undefined,
    };
  }

  private mapType(type: string): NetworkInfo['type'] {
    switch (type) {
      case 'wifi': return 'wifi';
      case 'cellular': return 'cellular';
      case 'ethernet': return 'ethernet';
      case 'none': return 'none';
      default: return 'unknown';
    }
  }
}

export const networkCollector = new NetworkCollector();
