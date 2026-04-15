import type { Call } from '@stream-io/video-react-native-sdk';
import { KafkaPublisher } from '../core/KafkaPublisher';
import { useWebRTCStore } from '../../store/webrtcStore';
import { FSMState } from './FSM';
import { ReceiverSRAgent } from './ReceiverSRAgent';
import type {
  AdaptationResult,
  AdaptationState,
  CongestionPrediction,
  FSMAction,
  FSMTransition,
  WebRTCMetrics,
} from './types';

interface SenderLike {
  track?: MediaStreamTrack | null;
  getParameters: () => RTCRtpSendParameters;
  setParameters: (params: RTCRtpSendParameters) => Promise<void>;
}

interface PeerConnectionHolder {
  pc?: RTCPeerConnection;
}

interface CallSfuLike {
  publisher?: PeerConnectionHolder;
}

type CallWithSfu = {
  sfuClient?: CallSfuLike;
};

const RESOLUTION_SCALE: Record<string, number> = {
  '1080p': 1,
  '720p': 1.5,
  '480p': 2.25,
  '360p': 3,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class WebRTCAdaptationController {
  private currentBitrateKbps = 2500;
  private currentResolution = '1080p';
  private srActive = false;
  private lastAdaptationTime = 0;
  private readonly MIN_ADAPTATION_INTERVAL_MS = 2000;
  private readonly kafkaPublisher = new KafkaPublisher();

  constructor(
    private readonly call: Call,
    private readonly participantId: string,
    private readonly srAgent?: ReceiverSRAgent
  ) {}

  async applyFSMAction(action: FSMAction, trigger: FSMTransition): Promise<AdaptationResult> {
    if (!this.canAdapt()) {
      return this.buildSkippedResult('fsm_transition', 'Skipped because the minimum adaptation interval has not elapsed.');
    }

    const before = this.getCurrentStateSnapshot();
    const bitrateApplied = await this.setBitrate(action.targetBitrateKbps);
    const resolutionApplied = await this.setResolution(action.targetResolution);
    const metrics = useWebRTCStore.getState().participants.get(this.participantId)?.latestMetrics;
    const srActivationState =
      metrics ? await this.updateSRActivation(metrics, trigger.currentState) : 'unchanged';
    const srChanged = srActivationState !== 'unchanged' || this.updateSrFlag(action.enableSR);
    const after = this.getCurrentStateSnapshot();

    const decision = this.pickDecision({
      before,
      after,
      bitrateApplied,
      resolutionApplied,
      srChanged,
    });

    const result: AdaptationResult = {
      applied: bitrateApplied || resolutionApplied || srChanged,
      decision,
      bitrateBeforeKbps: before.bitrateKbps,
      bitrateAfterKbps: after.bitrateKbps,
      resolutionBefore: before.resolution,
      resolutionAfter: after.resolution,
      trigger: 'fsm_transition',
      skippedReason:
        bitrateApplied || resolutionApplied || srChanged
          ? undefined
          : 'No RTP parameter changes were required for the new FSM target.',
    };

    if (result.applied) {
      this.lastAdaptationTime = Date.now();
      this.recordAdaptation(decision, trigger.reason, before, after);
    }

    return result;
  }

  async updateSRActivation(
    metrics: WebRTCMetrics,
    fsmState: FSMState
  ): Promise<'activated' | 'deactivated' | 'unchanged'> {
    if (!this.srAgent) {
      return 'unchanged';
    }

    const shouldBeActive = this.srAgent.shouldActivate(metrics, fsmState);
    const isCurrentlyActive = this.srAgent.isCurrentlyActive();
    const before = this.getCurrentStateSnapshot();

    if (shouldBeActive && !isCurrentlyActive) {
      this.srAgent.activate();
      this.srActive = true;
      const after = this.getCurrentStateSnapshot();
      this.recordAdaptation('sr_activation', fsmState, before, after);
      return 'activated';
    }

    if (!shouldBeActive && isCurrentlyActive) {
      this.srAgent.deactivate();
      this.srActive = false;
      const after = this.getCurrentStateSnapshot();
      this.recordAdaptation('sr_deactivation', fsmState, before, after);
      return 'deactivated';
    }

    this.srActive = isCurrentlyActive;
    return 'unchanged';
  }

  async applyCongestionWarning(
    prediction: CongestionPrediction,
    currentState: FSMState
  ): Promise<AdaptationResult | null> {
    if (prediction.warningLevel !== 'critical' || currentState !== FSMState.HD_CALL) {
      return null;
    }

    if (!this.canAdapt()) {
      return this.buildSkippedResult(
        'congestion_warning',
        'Skipped critical congestion warning because adaptation cooldown is still active.'
      );
    }

    const before = this.getCurrentStateSnapshot();
    const targetBitrate = Math.max(400, Math.min(before.bitrateKbps, Math.round(prediction.predictedBitrateKbps * 0.85)));
    const bitrateApplied = await this.setBitrate(targetBitrate);
    const resolutionApplied = await this.setResolution(targetBitrate < 900 ? '480p' : '720p');
    const after = this.getCurrentStateSnapshot();

    const result: AdaptationResult = {
      applied: bitrateApplied || resolutionApplied,
      decision: bitrateApplied ? 'bitrate_reduced' : resolutionApplied ? 'resolution_changed' : 'no_change',
      bitrateBeforeKbps: before.bitrateKbps,
      bitrateAfterKbps: after.bitrateKbps,
      resolutionBefore: before.resolution,
      resolutionAfter: after.resolution,
      trigger: 'congestion_warning',
      skippedReason:
        bitrateApplied || resolutionApplied
          ? undefined
          : 'Prediction did not require a lower bitrate or resolution change.',
    };

    if (result.applied) {
      this.lastAdaptationTime = Date.now();
      this.recordAdaptation(
        result.decision,
        `Critical congestion warning at probability ${(prediction.congestionProbability * 100).toFixed(0)}%.`,
        before,
        after
      );
    }

    return result;
  }

  private async setBitrate(targetKbps: number): Promise<boolean> {
    const sender = this.getVideoSender();
    const peerConnection = this.getPublisherPc();
    if (!sender || !peerConnection) {
      return false;
    }

    if (peerConnection.signalingState !== 'stable') {
      return false;
    }

    const safeTarget = clamp(targetKbps, 150, 10000);
    const nextTarget =
      safeTarget > this.currentBitrateKbps
        ? Math.min(safeTarget, Math.round(this.currentBitrateKbps * 1.4))
        : Math.max(safeTarget, Math.round(this.currentBitrateKbps * 0.4));

    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    let changed = false;
    params.encodings = params.encodings.map((encoding, index) => {
      const nextEncoding = { ...encoding };
      if (nextEncoding.maxBitrate !== nextTarget * 1000) {
        nextEncoding.maxBitrate = nextTarget * 1000;
        changed = true;
      }

      if (index > 0 && nextEncoding.maxBitrate && nextEncoding.maxBitrate > nextTarget * 1000) {
        nextEncoding.maxBitrate = nextTarget * 1000;
        changed = true;
      }

      return nextEncoding;
    });

    if (!changed) {
      this.currentBitrateKbps = nextTarget;
      return false;
    }

    await sender.setParameters(params);
    this.currentBitrateKbps = nextTarget;
    return true;
  }

  private async setResolution(resolution: string): Promise<boolean> {
    const sender = this.getVideoSender();
    const peerConnection = this.getPublisherPc();
    if (!sender || !peerConnection || peerConnection.signalingState !== 'stable') {
      return false;
    }

    const scaleDownBy = RESOLUTION_SCALE[resolution] ?? 1;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    let changed = false;
    params.encodings = params.encodings.map((encoding, index) => {
      const nextEncoding = { ...encoding };
      const nextScale = index === 0 ? scaleDownBy : Math.max(scaleDownBy, 1 + index);
      if (nextEncoding.scaleResolutionDownBy !== nextScale) {
        nextEncoding.scaleResolutionDownBy = nextScale;
        changed = true;
      }
      return nextEncoding;
    });

    if (!changed) {
      this.currentResolution = resolution;
      return false;
    }

    await sender.setParameters(params);
    this.currentResolution = resolution;
    return true;
  }

  private recordAdaptation(
    decision: string,
    trigger: string,
    before: AdaptationState,
    after: AdaptationState
  ): void {
    const sessionId = useWebRTCStore.getState().sessionId;
    useWebRTCStore.getState().actions.recordAdaptation(this.participantId, {
      applied: before.bitrateKbps !== after.bitrateKbps || before.resolution !== after.resolution || before.srActive !== after.srActive,
      decision:
        decision === 'sr_activated' ||
        decision === 'sr_deactivated' ||
        decision === 'sr_activation' ||
        decision === 'sr_deactivation' ||
        decision === 'bitrate_increased' ||
        decision === 'bitrate_reduced' ||
        decision === 'resolution_changed'
          ? (decision === 'sr_activation'
            ? 'sr_activated'
            : decision === 'sr_deactivation'
              ? 'sr_deactivated'
              : decision)
          : 'no_change',
      bitrateBeforeKbps: before.bitrateKbps,
      bitrateAfterKbps: after.bitrateKbps,
      resolutionBefore: before.resolution,
      resolutionAfter: after.resolution,
      trigger: trigger.includes('Critical congestion warning') ? 'congestion_warning' : 'fsm_transition',
    });

    if (!sessionId) {
      return;
    }

    const payload = {
      topic: 'webrtc-adaptations',
      messages: [
        {
          key: this.participantId,
          value: JSON.stringify({
            session_id: sessionId,
            participant_id: this.participantId,
            timestamp: Date.now(),
            decision_type: decision,
            trigger_reason: trigger,
            before_state: before,
            after_state: after,
          }),
        },
      ],
    };

    void this.kafkaPublisher.publish('webrtc-adaptations', payload).catch((error) => {
      console.warn('[MobCloudX] Failed to publish WebRTC adaptation:', error);
    });
  }

  private getCurrentStateSnapshot(): AdaptationState {
    return {
      bitrateKbps: this.currentBitrateKbps,
      resolution: this.currentResolution,
      srActive: this.srActive,
    };
  }

  private updateSrFlag(enableSR: boolean): boolean {
    const effectiveSR = this.srAgent?.isCurrentlyActive() ?? enableSR;
    if (this.srActive === effectiveSR) {
      return false;
    }
    this.srActive = effectiveSR;
    return true;
  }

  private canAdapt(): boolean {
    return Date.now() - this.lastAdaptationTime >= this.MIN_ADAPTATION_INTERVAL_MS;
  }

  private getPublisherPc(): RTCPeerConnection | null {
    return ((this.call as unknown as CallWithSfu).sfuClient?.publisher?.pc ?? null) as RTCPeerConnection | null;
  }

  private getVideoSender(): SenderLike | null {
    const peerConnection = this.getPublisherPc();
    if (!peerConnection) {
      return null;
    }

    const sender = peerConnection
      .getSenders()
      .find((candidate) => candidate.track?.kind === 'video') as SenderLike | undefined;

    return sender ?? null;
  }

  private buildSkippedResult(
    trigger: AdaptationResult['trigger'],
    skippedReason: string
  ): AdaptationResult {
    const snapshot = this.getCurrentStateSnapshot();
    return {
      applied: false,
      decision: 'no_change',
      bitrateBeforeKbps: snapshot.bitrateKbps,
      bitrateAfterKbps: snapshot.bitrateKbps,
      resolutionBefore: snapshot.resolution,
      resolutionAfter: snapshot.resolution,
      trigger,
      skippedReason,
    };
  }

  private pickDecision(input: {
    before: AdaptationState;
    after: AdaptationState;
    bitrateApplied: boolean;
    resolutionApplied: boolean;
    srChanged: boolean;
  }): AdaptationResult['decision'] {
    if (input.srChanged) {
      return input.after.srActive ? 'sr_activated' : 'sr_deactivated';
    }

    if (input.resolutionApplied) {
      return 'resolution_changed';
    }

    if (input.bitrateApplied) {
      return input.after.bitrateKbps >= input.before.bitrateKbps ? 'bitrate_increased' : 'bitrate_reduced';
    }

    return 'no_change';
  }
}
