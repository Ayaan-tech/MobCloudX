// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Battery Collector
// ─────────────────────────────────────────────────────────────

import * as Battery from 'expo-battery';
import type { BatteryInfo } from '../types';
import { logger } from '../core/logger';

type BatteryListener = (info: BatteryInfo) => void;

class BatteryCollector {
  private levelSub: Battery.Subscription | null = null;
  private stateSub: Battery.Subscription | null = null;
  private listeners: BatteryListener[] = [];
  private _current: BatteryInfo = { level: 1, isCharging: false };

  async start(): Promise<void> {
    // Initial read
    const [level, state] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync(),
    ]);
    this._current = {
      level: Math.max(0, level),
      isCharging: state === Battery.BatteryState.CHARGING,
    };

    // Subscribe to changes
    this.levelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      this._current.level = batteryLevel;
      this.notify();
    });

    this.stateSub = Battery.addBatteryStateListener(({ batteryState }) => {
      this._current.isCharging = batteryState === Battery.BatteryState.CHARGING;
      this.notify();
    });

    logger.debug('Battery collector started');
  }

  stop(): void {
    this.levelSub?.remove();
    this.stateSub?.remove();
    this.levelSub = null;
    this.stateSub = null;
    this.listeners = [];
  }

  addListener(cb: BatteryListener): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  get current(): BatteryInfo {
    return { ...this._current };
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb(this._current));
  }
}

export const batteryCollector = new BatteryCollector();
