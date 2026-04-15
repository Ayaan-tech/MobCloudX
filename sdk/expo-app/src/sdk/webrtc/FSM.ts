import { QoEThresholds, getResolutionLabel, toMilliseconds } from './WebRTCQoEModel';
import type { FSMAction, FSMTransition, QoEResult, WebRTCMetrics } from './types';

export const enum FSMState {
  HD_CALL = 'HD-Call',
  BANDWIDTH_CONSTRAINED = 'Bandwidth-Constrained',
  CPU_CONSTRAINED = 'CPU-Constrained',
  HIGH_LATENCY = 'High-Latency',
  PACKET_LOSS_DOMINANT = 'Packet-Loss-Dominant',
  RECOVERY = 'Recovery',
}

const STATE_ACTIONS: Record<FSMState, FSMAction> = {
  [FSMState.HD_CALL]: {
    targetBitrateKbps: 2500,
    targetResolution: '1080p',
    enableSR: false,
    increaseFEC: false,
    reduceKeyframeInterval: false,
    logLevel: 'info',
  },
  [FSMState.BANDWIDTH_CONSTRAINED]: {
    targetBitrateKbps: 600,
    targetResolution: '480p',
    enableSR: true,
    increaseFEC: false,
    reduceKeyframeInterval: false,
    logLevel: 'warn',
  },
  [FSMState.CPU_CONSTRAINED]: {
    targetBitrateKbps: 800,
    targetResolution: '720p',
    enableSR: false,
    increaseFEC: false,
    reduceKeyframeInterval: false,
    logLevel: 'warn',
  },
  [FSMState.HIGH_LATENCY]: {
    targetBitrateKbps: 1200,
    targetResolution: '720p',
    enableSR: false,
    increaseFEC: false,
    reduceKeyframeInterval: true,
    logLevel: 'warn',
  },
  [FSMState.PACKET_LOSS_DOMINANT]: {
    targetBitrateKbps: 400,
    targetResolution: '360p',
    enableSR: false,
    increaseFEC: true,
    reduceKeyframeInterval: true,
    logLevel: 'critical',
  },
  [FSMState.RECOVERY]: {
    targetBitrateKbps: 1000,
    targetResolution: '720p',
    enableSR: false,
    increaseFEC: false,
    reduceKeyframeInterval: false,
    logLevel: 'info',
  },
};

function getPacketLossRate(metrics: WebRTCMetrics): number {
  return metrics.packetLossRate;
}

function isHdCallCandidate(metrics: WebRTCMetrics, qoe: QoEResult): boolean {
  return (
    toMilliseconds(metrics.currentRoundTripTime) < QoEThresholds.fsm.hdRttMs &&
    getPacketLossRate(metrics) < QoEThresholds.fsm.hdPacketLossRate &&
    metrics.framesPerSecond >= QoEThresholds.fsm.hdFps &&
    metrics.qualityLimitationReason === 'none' &&
    qoe.score >= 80
  );
}

function isRecoveryCandidate(metrics: WebRTCMetrics): boolean {
  return (
    toMilliseconds(metrics.currentRoundTripTime) < QoEThresholds.fsm.recoveryRttMs &&
    getPacketLossRate(metrics) < QoEThresholds.fsm.recoveryPacketLossRate &&
    metrics.framesPerSecond >= QoEThresholds.fsm.recoveryFps &&
    metrics.qualityLimitationReason !== 'bandwidth' &&
    metrics.qualityLimitationReason !== 'cpu'
  );
}

export function computeTargetState(metrics: WebRTCMetrics, qoe: QoEResult): FSMState {
  const rttMs = toMilliseconds(metrics.currentRoundTripTime);
  const packetLossRate = getPacketLossRate(metrics);

  if (metrics.qualityLimitationReason === 'cpu') {
    return FSMState.CPU_CONSTRAINED;
  }

  if (packetLossRate > QoEThresholds.fsm.packetLossRate || metrics.pliCount > QoEThresholds.fsm.packetLossPliCount) {
    return FSMState.PACKET_LOSS_DOMINANT;
  }

  if (rttMs > QoEThresholds.fsm.highLatencyRttMs && packetLossRate < QoEThresholds.fsm.highLatencyPacketLossRate) {
    return FSMState.HIGH_LATENCY;
  }

  if (
    metrics.qualityLimitationReason === 'bandwidth' ||
    (metrics.availableOutgoingBitrate < QoEThresholds.fsm.bandwidthBitrateBps && qoe.score < QoEThresholds.fsm.bandwidthQoeScore)
  ) {
    return FSMState.BANDWIDTH_CONSTRAINED;
  }

  if (isRecoveryCandidate(metrics)) {
    return FSMState.RECOVERY;
  }

  if (isHdCallCandidate(metrics, qoe)) {
    return FSMState.HD_CALL;
  }

  return FSMState.RECOVERY;
}

function getReasonForState(state: FSMState, metrics: WebRTCMetrics, qoe: QoEResult): string {
  const rttMs = toMilliseconds(metrics.currentRoundTripTime).toFixed(0);
  const packetLossPercent = (getPacketLossRate(metrics) * 100).toFixed(1);

  switch (state) {
    case FSMState.CPU_CONSTRAINED:
      return `Encoder reported CPU limitation while rendering ${getResolutionLabel(metrics.frameHeight)} at ${metrics.framesPerSecond.toFixed(0)}fps.`;
    case FSMState.PACKET_LOSS_DOMINANT:
      return `Packet loss reached ${packetLossPercent}% with ${metrics.pliCount} PLI requests in the last interval.`;
    case FSMState.HIGH_LATENCY:
      return `Round-trip time rose to ${rttMs}ms while packet loss stayed below 3%, indicating latency-dominant degradation.`;
    case FSMState.BANDWIDTH_CONSTRAINED:
      return `Available outgoing bitrate dropped to ${Math.round(metrics.availableOutgoingBitrate / 1000)} kbps with QoE at ${qoe.score.toFixed(0)}.`;
    case FSMState.RECOVERY:
      return `Transport conditions are stabilising with RTT ${rttMs}ms, packet loss ${packetLossPercent}%, and ${metrics.framesPerSecond.toFixed(0)}fps.`;
    case FSMState.HD_CALL:
      return `Connection is stable for HD delivery with RTT ${rttMs}ms, packet loss ${packetLossPercent}%, and QoE ${qoe.score.toFixed(0)}.`;
    default:
      return 'State unchanged.';
  }
}

export class WebRTCFSM {
  private currentState: FSMState;
  private pendingState: FSMState | null = null;
  private pendingCount = 0;
  private readonly DEBOUNCE_COUNT = QoEThresholds.fsm.debounceCount;

  constructor(initialState: FSMState = FSMState.RECOVERY) {
    this.currentState = initialState;
  }

  update(metrics: WebRTCMetrics, qoe: QoEResult): FSMTransition {
    const computedTarget = computeTargetState(metrics, qoe);
    const targetState =
      computedTarget === FSMState.RECOVERY && this.currentState === FSMState.HD_CALL
        ? FSMState.HD_CALL
        : computedTarget;
    const previousState = this.currentState;

    if (targetState === this.currentState) {
      this.pendingState = null;
      this.pendingCount = 0;
      return {
        previousState,
        currentState: this.currentState,
        changed: false,
        reason: getReasonForState(this.currentState, metrics, qoe),
        recommendedAction: STATE_ACTIONS[this.currentState],
      };
    }

    if (this.pendingState === targetState) {
      this.pendingCount += 1;
    } else {
      this.pendingState = targetState;
      this.pendingCount = 1;
    }

    if (this.pendingCount >= this.DEBOUNCE_COUNT) {
      this.currentState = targetState;
      this.pendingState = null;
      this.pendingCount = 0;

      return {
        previousState,
        currentState: this.currentState,
        changed: true,
        reason: getReasonForState(this.currentState, metrics, qoe),
        recommendedAction: STATE_ACTIONS[this.currentState],
      };
    }

    return {
      previousState,
      currentState: this.currentState,
      changed: false,
      reason: `Observed ${targetState} conditions ${this.pendingCount}/${this.DEBOUNCE_COUNT} consecutive intervals; holding ${this.currentState}.`,
      recommendedAction: STATE_ACTIONS[this.currentState],
    };
  }

  getCurrentState(): FSMState {
    return this.currentState;
  }

  reset(): void {
    this.currentState = FSMState.RECOVERY;
    this.pendingState = null;
    this.pendingCount = 0;
  }
}
