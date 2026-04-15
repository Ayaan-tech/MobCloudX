import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import type { Call } from '@stream-io/video-react-native-sdk';
import type { FeedbackEvent, SessionFeedback } from './types';

interface LocalParticipantLike {
  isMicEnabled?: boolean;
  isCameraEnabled?: boolean;
}

interface CallStateLike {
  startedAt?: Date | number | string;
  localParticipant?: LocalParticipantLike;
}

interface CallIdentityLike {
  id?: string;
  cid?: string;
}

const REJOIN_WINDOW_MS = 2 * 60 * 1000;

function toEpochMillis(value: Date | number | string | undefined): number {
  if (!value) {
    return Date.now();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export class SessionFeedbackCollector {
  private events: FeedbackEvent[] = [];
  private callStartTime: number;
  private appStateSubscription: { remove: () => void } | null = null;
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private lastMicEnabled: boolean | null = null;
  private lastCameraEnabled: boolean | null = null;
  private muteToggleCount = 0;
  private cameraToggleCount = 0;
  private appBackgroundCount = 0;

  constructor(private readonly call: Call) {
    const state = (call as unknown as { state?: CallStateLike }).state;
    this.callStartTime = toEpochMillis(state?.startedAt);
  }

  startMonitoring(): void {
    void this.detectRejoin();
    this.pollHandle = setInterval(() => {
      const localParticipant = (this.call as unknown as { state?: CallStateLike }).state?.localParticipant;
      const isMicEnabled = Boolean(localParticipant?.isMicEnabled);
      const isCameraEnabled = Boolean(localParticipant?.isCameraEnabled);

      if (this.lastMicEnabled !== null && this.lastMicEnabled !== isMicEnabled) {
        this.muteToggleCount += 1;
        this.events.push({ type: 'mute_toggle', timestamp: Date.now() });
      }
      if (this.lastCameraEnabled !== null && this.lastCameraEnabled !== isCameraEnabled) {
        this.cameraToggleCount += 1;
        this.events.push({ type: 'camera_toggle', timestamp: Date.now() });
      }

      this.lastMicEnabled = isMicEnabled;
      this.lastCameraEnabled = isCameraEnabled;
    }, 1000);

    this.appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        this.appBackgroundCount += 1;
        this.events.push({ type: 'app_background', timestamp: Date.now() });
      }
    });
  }

  stopMonitoring(): SessionFeedback {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    void this.persistLeaveTimestamp();

    const durationSeconds = Math.max(1, Math.round((Date.now() - this.callStartTime) / 1000));
    const implicitSatisfaction: SessionFeedback['implicit_satisfaction'] =
      durationSeconds > 600 && this.muteToggleCount < 2
        ? 'positive'
        : durationSeconds < 180 || this.muteToggleCount > 5
          ? 'negative'
          : 'neutral';

    return {
      duration_seconds: durationSeconds,
      mute_toggle_count: this.muteToggleCount,
      camera_toggle_count: this.cameraToggleCount,
      app_background_count: this.appBackgroundCount,
      implicit_satisfaction: implicitSatisfaction,
    };
  }

  private async detectRejoin(): Promise<void> {
    const key = this.storageKey();
    const previousLeave = await AsyncStorage.getItem(key);
    if (!previousLeave) {
      return;
    }

    const lastLeaveTimestamp = Number(previousLeave);
    if (Number.isFinite(lastLeaveTimestamp) && Date.now() - lastLeaveTimestamp <= REJOIN_WINDOW_MS) {
      this.events.push({ type: 'rejoin', timestamp: Date.now() });
    }
  }

  private async persistLeaveTimestamp(): Promise<void> {
    await AsyncStorage.setItem(this.storageKey(), Date.now().toString());
  }

  private storageKey(): string {
    const identity = this.call as unknown as CallIdentityLike;
    return `mobcloudx:webrtc:last-leave:${identity.id ?? identity.cid ?? 'unknown-call'}`;
  }
}
