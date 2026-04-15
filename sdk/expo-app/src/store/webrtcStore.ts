import { create } from 'zustand';
import { WebRTCFSM } from '../sdk/webrtc/FSM';
import { WebRTCQoEModel } from '../sdk/webrtc/WebRTCQoEModel';
import {
  type AdaptationResult,
  type CongestionPrediction,
  type QoEWeights,
  EMPTY_QOE_RESULT,
  EMPTY_WEBRTC_METRICS,
  type ParticipantQoE,
  type FSMTransition,
  type WebRTCMetrics,
} from '../sdk/webrtc/types';

type WebRTCEventMap = {
  'fsm.transition': {
    participantId: string;
    metrics: WebRTCMetrics;
    participant: ParticipantQoE;
    transition: FSMTransition;
  };
};

type WebRTCEventListener<K extends keyof WebRTCEventMap> = (payload: WebRTCEventMap[K]) => void;

class EventEmitter {
  private listeners = new Map<keyof WebRTCEventMap, Set<WebRTCEventListener<keyof WebRTCEventMap>>>();

  on<K extends keyof WebRTCEventMap>(event: K, listener: WebRTCEventListener<K>): () => void {
    const existing = this.listeners.get(event) ?? new Set();
    existing.add(listener as WebRTCEventListener<keyof WebRTCEventMap>);
    this.listeners.set(event, existing);

    return () => {
      this.off(event, listener);
    };
  }

  off<K extends keyof WebRTCEventMap>(event: K, listener: WebRTCEventListener<K>): void {
    const existing = this.listeners.get(event);
    if (!existing) {
      return;
    }

    existing.delete(listener as WebRTCEventListener<keyof WebRTCEventMap>);
    if (existing.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit<K extends keyof WebRTCEventMap>(event: K, payload: WebRTCEventMap[K]): void {
    const existing = this.listeners.get(event);
    if (!existing) {
      return;
    }

    existing.forEach((listener) => {
      listener(payload);
    });
  }
}

interface WebRTCStoreState {
  sessionId: string | null;
  callId: string | null;
  participants: Map<string, ParticipantQoE>;
  isCallActive: boolean;
  qoeModel: WebRTCQoEModel;
  fsmInstances: Map<string, WebRTCFSM>;
  flWeightsVersion: number;
}

interface WebRTCStoreActions {
  initSession: (callId: string, sessionId?: string | null) => void;
  updateParticipantMetrics: (participantId: string, metrics: WebRTCMetrics) => void;
  updateParticipantPrediction: (participantId: string, prediction: CongestionPrediction) => void;
  recordAdaptation: (participantId: string, result: AdaptationResult) => void;
  applyFLWeights: (weights: Partial<QoEWeights>) => void;
  endSession: () => void;
}

export interface WebRTCStore extends WebRTCStoreState {
  actions: WebRTCStoreActions;
}

export const webrtcEventEmitter = new EventEmitter();

function createSessionId(): string {
  return `webrtc-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export const useWebRTCStore = create<WebRTCStore>((set) => ({
  sessionId: null,
  callId: null,
  participants: new Map<string, ParticipantQoE>(),
  isCallActive: false,
  qoeModel: new WebRTCQoEModel(),
  fsmInstances: new Map<string, WebRTCFSM>(),
  flWeightsVersion: 0,
  actions: {
    initSession: (callId: string, sessionId?: string | null) =>
      set({
        sessionId: sessionId ?? createSessionId(),
        callId,
        isCallActive: true,
        participants: new Map<string, ParticipantQoE>(),
        fsmInstances: new Map<string, WebRTCFSM>(),
      }),
    updateParticipantMetrics: (participantId: string, metrics: WebRTCMetrics) =>
      set((state) => {
        const nextParticipants = new Map(state.participants);
        const nextFsmInstances = new Map(state.fsmInstances);
        const existingParticipant = nextParticipants.get(participantId);
        const qoeResult = state.qoeModel.compute(metrics);
        const fsm = nextFsmInstances.get(participantId) ?? new WebRTCFSM();
        const transition = fsm.update(metrics, qoeResult);
        nextFsmInstances.set(participantId, fsm);

        const nextParticipant: ParticipantQoE = {
          participantId,
          latestMetrics: metrics,
          qoeScore: qoeResult.score,
          fsmState: transition.currentState,
          srActive: transition.recommendedAction.enableSR,
          qoeResult,
          lastTransition: transition,
          latestPrediction: existingParticipant?.latestPrediction ?? null,
          latestPredictedBitrateKbps: existingParticipant?.latestPredictedBitrateKbps ?? null,
          latestCongestionProbability: existingParticipant?.latestCongestionProbability ?? null,
          warningLevel: existingParticipant?.warningLevel ?? 'none',
          lastAdaptation: existingParticipant?.lastAdaptation ?? null,
          lastUpdated: Date.now(),
        };

        nextParticipants.set(participantId, nextParticipant);

        if (transition.changed) {
          webrtcEventEmitter.emit('fsm.transition', {
            participantId,
            metrics,
            participant: nextParticipant,
            transition,
          });
        }

        return {
          participants: nextParticipants,
          fsmInstances: nextFsmInstances,
        };
      }),
    updateParticipantPrediction: (participantId: string, prediction: CongestionPrediction) =>
      set((state) => {
        const nextParticipants = new Map(state.participants);
        const existingParticipant = nextParticipants.get(participantId);

        const nextParticipant: ParticipantQoE = {
          participantId,
          latestMetrics: existingParticipant?.latestMetrics ?? { ...EMPTY_WEBRTC_METRICS },
          qoeScore: existingParticipant?.qoeScore ?? 0,
          fsmState: existingParticipant?.fsmState ?? new WebRTCFSM().getCurrentState(),
          srActive: existingParticipant?.srActive ?? false,
          qoeResult: existingParticipant?.qoeResult ?? { ...EMPTY_QOE_RESULT },
          lastTransition: existingParticipant?.lastTransition ?? null,
          latestPrediction: prediction,
          latestPredictedBitrateKbps: prediction.predictedBitrateKbps,
          latestCongestionProbability: prediction.congestionProbability,
          warningLevel: prediction.warningLevel,
          lastAdaptation: existingParticipant?.lastAdaptation ?? null,
          lastUpdated: Date.now(),
        };

        nextParticipants.set(participantId, nextParticipant);
        return { participants: nextParticipants };
      }),
    recordAdaptation: (participantId: string, result: AdaptationResult) =>
      set((state) => {
        const nextParticipants = new Map(state.participants);
        const existingParticipant = nextParticipants.get(participantId);
        if (!existingParticipant) {
          return { participants: nextParticipants };
        }

        nextParticipants.set(participantId, {
          ...existingParticipant,
          srActive:
            result.decision === 'sr_activated'
              ? true
              : result.decision === 'sr_deactivated'
                ? false
                : existingParticipant.srActive,
          lastAdaptation: result,
          lastUpdated: Date.now(),
        });

        return { participants: nextParticipants };
      }),
    applyFLWeights: (weights: Partial<QoEWeights>) =>
      set((state) => {
        state.qoeModel.updateWeights(weights);
        const nextParticipants = new Map(state.participants);
        const nextFsmInstances = new Map(state.fsmInstances);

        nextParticipants.forEach((participant, participantId) => {
          const qoeResult = state.qoeModel.compute(participant.latestMetrics);
          const fsm = nextFsmInstances.get(participantId) ?? new WebRTCFSM(participant.fsmState);
          const transition = fsm.update(participant.latestMetrics, qoeResult);
          nextFsmInstances.set(participantId, fsm);

          nextParticipants.set(participantId, {
            ...participant,
            qoeScore: qoeResult.score,
            qoeResult,
            fsmState: transition.currentState,
            lastTransition: transition,
            lastUpdated: Date.now(),
          });
        });

        return {
          participants: nextParticipants,
          fsmInstances: nextFsmInstances,
          flWeightsVersion: state.flWeightsVersion + 1,
        };
      }),
    endSession: () =>
      set({
        sessionId: null,
        callId: null,
        isCallActive: false,
        participants: new Map<string, ParticipantQoE>(),
        fsmInstances: new Map<string, WebRTCFSM>(),
        flWeightsVersion: 0,
      }),
  },
}));

export {
  EMPTY_QOE_RESULT,
  EMPTY_WEBRTC_METRICS,
  type ParticipantQoE,
  type WebRTCMetrics,
};
