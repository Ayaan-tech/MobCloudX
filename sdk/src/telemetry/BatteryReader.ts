// src/telemetry/BatteryReader.ts
// Lightweight expo-battery wrapper for FL context.

import * as Battery from 'expo-battery';

export async function getBatteryLevel(): Promise<number> {
  try {
    return Math.round((await Battery.getBatteryLevelAsync()) * 100);
  } catch {
    return -1;
  }
}

export async function isCharging(): Promise<boolean> {
  try {
    const s = await Battery.getBatteryStateAsync();
    return (
      s === Battery.BatteryState.CHARGING || s === Battery.BatteryState.FULL
    );
  } catch {
    return false;
  }
}

export function subscribeBattery(
  cb: (level: number, charging: boolean) => void
): Battery.Subscription {
  return Battery.addBatteryLevelListener(async ({ batteryLevel }) => {
    cb(Math.round(batteryLevel * 100), await isCharging());
  });
}
