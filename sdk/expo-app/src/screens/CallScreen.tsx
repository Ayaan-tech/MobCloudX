import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CallContent,
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  type Call,
} from '@stream-io/video-react-native-sdk';
import type { Observable } from 'rxjs';
import { useSDKStore } from '../core/store';
import { getInferenceApiBaseUrl } from '../core/api-config';
import { SDKMode, useSDKContext } from '../sdk/core/SDKContext';
import { KafkaPublisher } from '../sdk/core/KafkaPublisher';
import { DemoThrottleSimulator, type ThrottleLevel } from '../sdk/webrtc/DemoThrottleSimulator';
import { FSMState } from '../sdk/webrtc/FSM';
import { FLWeightsAgent } from '../sdk/webrtc/FLWeightsAgent';
import { PerformanceProfiler } from '../sdk/webrtc/PerformanceProfiler';
import { ReceiverSRAgent } from '../sdk/webrtc/ReceiverSRAgent';
import { SessionFeedbackCollector } from '../sdk/webrtc/SessionFeedbackCollector';
import { getResolutionLabel } from '../sdk/webrtc/WebRTCQoEModel';
import { WebRTCTelemetryAgent } from '../sdk/webrtc/WebRTCTelemetryAgent';
import { CongestionPredictor } from '../sdk/webrtc/CongestionPredictor';
import { WebRTCAdaptationController } from '../sdk/webrtc/WebRTCAdaptationController';
import type {
  CongestionPrediction,
  FLSessionSummaryPayload,
  ParticipantQoE,
  QoEWeights,
  WebRTCSessionSummaryResponse,
} from '../sdk/webrtc/types';
import { EMPTY_WEBRTC_METRICS, useWebRTCStore, webrtcEventEmitter } from '../store/webrtcStore';

const DEMO_MODE_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
const DEMO_THROTTLE_LEVELS = Object.keys(DemoThrottleSimulator.LEVELS) as ThrottleLevel[];

interface TokenResponse {
  token: string;
  apiKey?: string;
  api_key?: string; // Backend returns snake_case
  user_id?: string; // Backend returns snake_case
  userId?: string;
  userName?: string;
  call_id?: string;
  session_id?: string;
  expires_at?: number;
}

interface DeviceInfoPayload {
  ram_gb: number;
  model: string;
  android_version: number;
}

interface StreamParticipant {
  userId?: string;
  sessionId?: string;
}

interface ParticipantStateContainer {
  participants$: Observable<StreamParticipant[]>;
}

interface PeerConnectionHolder {
  pc?: RTCPeerConnection;
}

interface SfuClientLike {
  publisher?: PeerConnectionHolder;
  subscriber?: PeerConnectionHolder;
}

interface CallInternals {
  state: ParticipantStateContainer;
  sfuClient?: SfuClientLike;
  join: (options: { create: boolean }) => Promise<void>;
  leave: () => Promise<void>;
}

async function ensureAndroidMediaPermissions(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const requiredPermissions = [
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ];

  const statuses = await PermissionsAndroid.requestMultiple(requiredPermissions);
  const deniedPermissions = requiredPermissions.filter(
    (permission) => statuses[permission] !== PermissionsAndroid.RESULTS.GRANTED
  );

  if (deniedPermissions.length === 0) {
    return;
  }

  const blocked = deniedPermissions.some(
    (permission) => statuses[permission] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
  );

  if (blocked) {
    throw new Error('Camera and microphone permissions are blocked in system settings.');
  }

  throw new Error('Camera and microphone permissions are required to join the call.');
}

function isMediaPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('permission denied') ||
    message.includes('permissions are blocked') ||
    message.includes('permissions are required') ||
    message.includes('securityerror')
  );
}

function getBadgeColor(score: number): string {
  if (score >= 75) return '#10B981';
  if (score >= 50) return '#F59E0B';
  return '#EF4444';
}

function getResolutionAndFps(participant: ParticipantQoE): string {
  return `${getResolutionLabel(participant.latestMetrics.frameHeight)} · ${Math.round(participant.latestMetrics.framesPerSecond)}fps`;
}

function formatPredictedBitrate(prediction: CongestionPrediction | null): string {
  if (!prediction) {
    return '↓ -- Mbps';
  }
  return `↓${(prediction.predictedBitrateKbps / 1000).toFixed(1)} Mbps`;
}

function formatWarningTimestamp(timestamp: number | null): string {
  if (!timestamp) {
    return '--';
  }

  return new Date(timestamp).toLocaleTimeString();
}

function formatWeightValue(value: number): string {
  return value.toFixed(2);
}

function getParticipantDisplayName(
  participantId: string,
  localParticipantId: string | null,
  peerIndex: number
): string {
  if (participantId === localParticipantId) {
    return 'You';
  }

  if (peerIndex < 0) {
    return 'Participant';
  }

  return `Peer ${peerIndex + 1}`;
}

function ParticipantHudBadge({
  participant,
  displayName,
  onPress,
}: {
  participant: ParticipantQoE;
  displayName: string;
  onPress: () => void;
}): JSX.Element {
  const animatedValue = useRef(new Animated.Value(participant.qoeScore)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [displayedScore, setDisplayedScore] = useState(Math.round(participant.qoeScore));

  useEffect(() => {
    const listenerId = animatedValue.addListener(({ value }) => {
      setDisplayedScore(Math.round(value));
    });

    Animated.timing(animatedValue, {
      toValue: participant.qoeScore,
      duration: 500,
      useNativeDriver: false,
    }).start();

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [animatedValue, participant.qoeScore]);

  useEffect(() => {
    if (participant.warningLevel !== 'critical') {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [participant.warningLevel, pulse]);

  const borderColor = animatedValue.interpolate({
    inputRange: [0, 50, 75, 100],
    outputRange: ['#EF4444', '#EF4444', '#F59E0B', '#10B981'],
  });

  return (
    <Pressable onPress={onPress}>
      <Animated.View style={[styles.hudBadge, { borderColor }]}>
        <View style={styles.hudTopRow}>
          <Text style={styles.hudName}>{displayName}</Text>
          {participant.warningLevel === 'critical' ? (
            <Animated.View
              style={[
                styles.warningPulse,
                {
                  transform: [
                    {
                      scale: pulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.6],
                      }),
                    },
                  ],
                  opacity: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.95, 0.2],
                  }),
                },
              ]}
            />
          ) : null}
        </View>
        <Text style={[styles.hudScore, { color: getBadgeColor(displayedScore) }]}>QoE {displayedScore}</Text>
        <Text style={styles.hudState}>{participant.fsmState}</Text>
        <Text style={styles.hudMeta}>{getResolutionAndFps(participant)}</Text>
        <Text style={styles.hudPrediction}>{formatPredictedBitrate(participant.latestPrediction)}</Text>
      </Animated.View>
    </Pressable>
  );
}

function DemoControlsPanel({
  isExpanded,
  onToggle,
  throttleLevel,
  onSelectThrottle,
  participants,
  selectedParticipantId,
  onSelectParticipant,
  selectedParticipant,
  lastWarningTimestamp,
  currentWeights,
  resolveParticipantLabel,
  onReset,
  onRunProfiler,
  isProfiling,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  throttleLevel: ThrottleLevel;
  onSelectThrottle: (level: ThrottleLevel) => void;
  participants: ParticipantQoE[];
  selectedParticipantId: string | null;
  onSelectParticipant: (participantId: string) => void;
  selectedParticipant: ParticipantQoE | null;
  lastWarningTimestamp: number | null;
  currentWeights: QoEWeights;
  resolveParticipantLabel: (participant: ParticipantQoE, index: number) => string;
  onReset: () => void;
  onRunProfiler: () => void;
  isProfiling: boolean;
}): JSX.Element {
  return (
    <View style={styles.demoPanel}>
      <Pressable style={styles.demoPanelHeader} onPress={onToggle}>
        <View>
          <Text style={styles.demoPanelTitle}>Demo Controls</Text>
          <Text style={styles.demoPanelSubtitle}>2-participant simulator overlay</Text>
        </View>
        <Text style={styles.demoPanelToggle}>{isExpanded ? 'Hide' : 'Show'}</Text>
      </Pressable>

      {isExpanded ? (
        <>
          <Text style={styles.demoLabel}>Throttle Level</Text>
          <View style={styles.demoSegmentRow}>
            {DEMO_THROTTLE_LEVELS.map((level) => (
              <Pressable
                key={level}
                style={[
                  styles.demoSegment,
                  throttleLevel === level ? styles.demoSegmentActive : null,
                ]}
                onPress={() => onSelectThrottle(level)}
              >
                <Text
                  style={[
                    styles.demoSegmentText,
                    throttleLevel === level ? styles.demoSegmentTextActive : null,
                  ]}
                >
                  {level.replaceAll('_', ' ')}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.demoLabel}>Apply To Participant</Text>
          <View style={styles.demoParticipantRow}>
            {participants.map((participant, index) => (
              <Pressable
                key={participant.participantId}
                style={[
                  styles.demoParticipantChip,
                  selectedParticipantId === participant.participantId ? styles.demoParticipantChipActive : null,
                ]}
                onPress={() => onSelectParticipant(participant.participantId)}
              >
                <Text
                  style={[
                    styles.demoParticipantChipText,
                    selectedParticipantId === participant.participantId
                      ? styles.demoParticipantChipTextActive
                      : null,
                  ]}
                >
                  {resolveParticipantLabel(participant, index)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.demoReactionCard}>
            <Text style={styles.demoReactionTitle}>Live Reaction</Text>
            <View style={styles.demoReactionRow}>
              <Text style={styles.demoReactionLabel}>FSM</Text>
              <Text style={styles.demoReactionValue}>{selectedParticipant?.fsmState ?? '--'}</Text>
            </View>
            <View style={styles.demoReactionRow}>
              <Text style={styles.demoReactionLabel}>QoE</Text>
              <Text style={styles.demoReactionValue}>
                {selectedParticipant ? selectedParticipant.qoeScore.toFixed(1) : '--'}
              </Text>
            </View>
            <View style={styles.demoReactionRow}>
              <Text style={styles.demoReactionLabel}>Last LSTM Warning</Text>
              <Text style={styles.demoReactionValue}>{formatWarningTimestamp(lastWarningTimestamp)}</Text>
            </View>
            <View style={styles.demoReactionRow}>
              <Text style={styles.demoReactionLabel}>SR</Text>
              <Text style={styles.demoReactionValue}>
                {selectedParticipant?.qoeResult.srActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
            <View style={styles.demoReactionRow}>
              <Text style={styles.demoReactionLabel}>BRISQUE</Text>
              <Text style={styles.demoReactionValue}>
                {selectedParticipant?.qoeResult.brisqueScore !== null && selectedParticipant?.qoeResult.brisqueScore !== undefined
                  ? selectedParticipant.qoeResult.brisqueScore.toFixed(1)
                  : '--'}
              </Text>
            </View>
            <View style={styles.demoReactionRow}>
              <Text style={styles.demoReactionLabel}>Target</Text>
              <Text style={styles.demoReactionValue}>
                {selectedParticipant?.lastTransition?.recommendedAction.targetResolution ?? '--'} · {selectedParticipant?.lastTransition?.recommendedAction.targetBitrateKbps ?? '--'} kbps
              </Text>
            </View>
            <View style={styles.demoReactionRow}>
              <Text style={styles.demoReactionLabel}>FL Weights</Text>
              <Text style={styles.demoReactionValue}>
                α {formatWeightValue(currentWeights.alpha)} · β {formatWeightValue(currentWeights.beta)} · γ{' '}
                {formatWeightValue(currentWeights.gamma)} · δ {formatWeightValue(currentWeights.delta)} · ε{' '}
                {formatWeightValue(currentWeights.epsilon)}
              </Text>
            </View>
          </View>

          <View style={styles.demoActionsRow}>
            <Pressable
              style={[styles.demoSecondaryButton, isProfiling ? styles.demoSecondaryButtonDisabled : null]}
              onPress={onRunProfiler}
              disabled={isProfiling}
            >
              <Text style={styles.demoSecondaryButtonText}>
                {isProfiling ? 'Profiling…' : 'Run Profiler'}
              </Text>
            </Pressable>
            <Pressable style={styles.demoPrimaryButton} onPress={onReset}>
              <Text style={styles.demoPrimaryButtonText}>Reset All</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

export default function CallScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ callId?: string }>();
  const requestedCallId = params.callId ?? 'mobcloudx-demo-call';
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const inferenceApiBaseUrl = useSDKStore((state) => getInferenceApiBaseUrl(state.config));
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [callId, setCallId] = useState(requestedCallId);
  const [isJoining, setIsJoining] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [showModelToast, setShowModelToast] = useState(false);
  const [isProfiling, setIsProfiling] = useState(false);
  const [isDemoPanelExpanded, setIsDemoPanelExpanded] = useState(false);
  const [demoThrottleLevel, setDemoThrottleLevel] = useState<ThrottleLevel>('NONE');
  const [demoParticipantId, setDemoParticipantId] = useState<string | null>(null);
  const [lastWarningByParticipant, setLastWarningByParticipant] = useState<Record<string, number>>({});
  const kafkaPublisher = useMemo(() => new KafkaPublisher(), []);
  const demoThrottleRef = useRef(new DemoThrottleSimulator());
  const performanceProfilerRef = useRef(new PerformanceProfiler());
  const telemetryAgentsRef = useRef<Map<string, WebRTCTelemetryAgent>>(new Map());
  const predictorsRef = useRef<Map<string, CongestionPredictor>>(new Map());
  const adaptationControllersRef = useRef<Map<string, WebRTCAdaptationController>>(new Map());
  const participantAliasRef = useRef<Map<string, string>>(new Map());
  const attachRetryTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const receiverSrAgentRef = useRef<ReceiverSRAgent | null>(null);
  const flWeightsAgentRef = useRef<FLWeightsAgent | null>(null);
  const feedbackCollectorRef = useRef<SessionFeedbackCollector | null>(null);
  const localParticipantIdRef = useRef<string | null>(null);
  const didEndSessionRef = useRef(false);
  const previousFlVersionRef = useRef<number | null>(null);
  const participants = useWebRTCStore((state) => Array.from(state.participants.values()));
  const actions = useWebRTCStore((state) => state.actions);
  const sessionId = useWebRTCStore((state) => state.sessionId);
  const flWeightsVersion = useWebRTCStore((state) => state.flWeightsVersion);
  const { registerAgent, unregisterAgent, setMode } = useSDKContext();
  const selectedParticipant = participants.find(
    (participant) => participant.participantId === selectedParticipantId
  ) ?? null;
  const demoParticipants = useMemo(() => participants.slice(0, 2), [participants]);
  const selectedDemoParticipant = demoParticipants.find(
    (participant) => participant.participantId === demoParticipantId
  ) ?? null;
  const lastDemoWarningTimestamp =
    (demoParticipantId ? lastWarningByParticipant[demoParticipantId] : null) ?? null;
  const currentFlWeights = useMemo(
    () => useWebRTCStore.getState().qoeModel.getWeights(),
    [flWeightsVersion]
  );
  const compactLayout = screenWidth < 420;
  const callSurfaceHeight = Math.max(320, Math.min(screenHeight * 0.42, 460));

  const endSessionOnServer = async (
    activeSessionId: string | null
  ): Promise<WebRTCSessionSummaryResponse | null> => {
    if (!activeSessionId || !inferenceApiBaseUrl || didEndSessionRef.current) {
      return null;
    }

    didEndSessionRef.current = true;
    try {
      const response = await fetch(`${inferenceApiBaseUrl}/webrtc/session/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: activeSessionId }),
      });

      if (!response.ok) {
        throw new Error(`Session end request failed with status ${response.status}.`);
      }

      return (await response.json()) as WebRTCSessionSummaryResponse;
    } catch (error) {
      console.warn('[MobCloudX] Failed to close WebRTC session:', error);
      return null;
    }
  };

  const flushSessionLearning = async (activeSessionId: string | null): Promise<void> => {
    const feedback = feedbackCollectorRef.current?.stopMonitoring();
    const summaryResponse = await endSessionOnServer(activeSessionId);
    if (!summaryResponse || !feedback || !flWeightsAgentRef.current) {
      return;
    }

    const payload: FLSessionSummaryPayload = {
      session_id: summaryResponse.session_id,
      ...summaryResponse.qoe_summary,
      feedback,
    };

    try {
      await flWeightsAgentRef.current.submitUpdate(payload);
    } catch (error) {
      console.warn('[MobCloudX] Failed to submit WebRTC FL update:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = webrtcEventEmitter.on('fsm.transition', ({ participantId, transition }) => {
      if (participantId !== localParticipantIdRef.current) {
        return;
      }

      const controller = adaptationControllersRef.current.get(participantId);
      if (!controller) {
        return;
      }

      void controller.applyFSMAction(transition.recommendedAction, transition);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (previousFlVersionRef.current === null) {
      previousFlVersionRef.current = flWeightsVersion;
      return;
    }

    if (flWeightsVersion > previousFlVersionRef.current) {
      setShowModelToast(true);
      const timeout = setTimeout(() => {
        setShowModelToast(false);
      }, 2200);
      previousFlVersionRef.current = flWeightsVersion;
      return () => clearTimeout(timeout);
    }

    previousFlVersionRef.current = flWeightsVersion;
    return undefined;
  }, [flWeightsVersion]);

  useEffect(() => {
    if (!DEMO_MODE_ENABLED) {
      return;
    }

    if (!demoParticipantId && demoParticipants.length > 0) {
      const nextParticipantId = demoParticipants[0].participantId;
      demoThrottleRef.current.setTargetParticipant(nextParticipantId);
      setDemoParticipantId(nextParticipantId);
    }
  }, [demoParticipantId, demoParticipants]);

  useEffect(() => {
    let isMounted = true;
    let activeCall: Call | null = null;
    let activeClient: StreamVideoClient | null = null;
    let activeSessionId: string | null = null;
    let subscription: { unsubscribe: () => void } | null = null;

    const attachParticipant = async (
      participantId: string,
      internals: CallInternals,
      resolvedSessionId: string
    ): Promise<void> => {
      const peerConnection = internals.sfuClient?.subscriber?.pc ?? internals.sfuClient?.publisher?.pc;
      if (telemetryAgentsRef.current.has(participantId)) {
        return;
      }

      if (!peerConnection) {
        // SFU internals can arrive slightly after participants$ emits; retry attach once the PC is available.
        if (!attachRetryTimeoutsRef.current.has(participantId)) {
          actions.updateParticipantMetrics(participantId, { ...EMPTY_WEBRTC_METRICS });
          const timeoutId = setTimeout(() => {
            attachRetryTimeoutsRef.current.delete(participantId);
            void attachParticipant(participantId, internals, resolvedSessionId);
          }, 1000);
          attachRetryTimeoutsRef.current.set(participantId, timeoutId);
        }
        return;
      }

      const pendingTimeout = attachRetryTimeoutsRef.current.get(participantId);
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        attachRetryTimeoutsRef.current.delete(participantId);
      }

      const telemetryAgent = new WebRTCTelemetryAgent(
        peerConnection,
        participantId,
        resolvedSessionId,
        kafkaPublisher
      );

      if (participantId === localParticipantIdRef.current && receiverSrAgentRef.current) {
        telemetryAgent.setSRAgent(receiverSrAgentRef.current);
      }
      telemetryAgent.start();
      telemetryAgentsRef.current.set(participantId, telemetryAgent);
      registerAgent({
        id: `webrtc-${participantId}`,
        kind: SDKMode.WEBRTC,
        start: () => telemetryAgent.start(),
        stop: () => telemetryAgent.stop(),
        destroy: () => telemetryAgent.destroy(),
      });

      const predictor = new CongestionPredictor();
      predictorsRef.current.set(participantId, predictor);
      try {
        await predictor.initialize();
      } catch (error) {
        console.warn('[MobCloudX] Predictor initialisation failed, using fallback predictions:', error);
      }

      predictor.startAutoPredict(
        () => {
          const baseMetrics = telemetryAgent.getLatestMetrics();
          return DEMO_MODE_ENABLED
            ? demoThrottleRef.current.interceptMetrics(baseMetrics, participantId)
            : baseMetrics;
        },
        (prediction) => {
          telemetryAgent.setLatestPrediction(prediction);
          actions.updateParticipantPrediction(participantId, prediction);

          if (prediction.warningLevel !== 'none') {
            setLastWarningByParticipant((current) => ({
              ...current,
              [participantId]: prediction.timestamp,
            }));
          }

          if (participantId !== localParticipantIdRef.current) {
            return;
          }

          const participant = useWebRTCStore.getState().participants.get(participantId);
          const currentState = participant?.fsmState ?? FSMState.RECOVERY;
          const controller = adaptationControllersRef.current.get(participantId);
          if (controller && prediction.warningLevel !== 'none') {
            void controller.applyCongestionWarning(prediction, currentState);
          }
        }
      );

      if (participantId === localParticipantIdRef.current && activeCall) {
        adaptationControllersRef.current.set(
          participantId,
          new WebRTCAdaptationController(activeCall, participantId, receiverSrAgentRef.current ?? undefined)
        );
      }

      actions.updateParticipantMetrics(participantId, telemetryAgent.getLatestMetrics());
    };

    const migrateParticipantKey = (oldId: string, newId: string) => {
      if (oldId === newId || !oldId || !newId) {
        return;
      }

      if (telemetryAgentsRef.current.has(oldId) && !telemetryAgentsRef.current.has(newId)) {
        const telemetryAgent = telemetryAgentsRef.current.get(oldId);
        if (telemetryAgent) {
          telemetryAgentsRef.current.set(newId, telemetryAgent);
          telemetryAgentsRef.current.delete(oldId);
          unregisterAgent(SDKMode.WEBRTC, `webrtc-${oldId}`);
          registerAgent({
            id: `webrtc-${newId}`,
            kind: SDKMode.WEBRTC,
            start: () => telemetryAgent.start(),
            stop: () => telemetryAgent.stop(),
            destroy: () => telemetryAgent.destroy(),
          });
        }
      }

      if (predictorsRef.current.has(oldId) && !predictorsRef.current.has(newId)) {
        const predictor = predictorsRef.current.get(oldId);
        if (predictor) {
          predictorsRef.current.set(newId, predictor);
          predictorsRef.current.delete(oldId);
        }
      }

      if (adaptationControllersRef.current.has(oldId) && !adaptationControllersRef.current.has(newId)) {
        const controller = adaptationControllersRef.current.get(oldId);
        if (controller) {
          adaptationControllersRef.current.set(newId, controller);
          adaptationControllersRef.current.delete(oldId);
        }
      }

      const retryTimeout = attachRetryTimeoutsRef.current.get(oldId);
      if (retryTimeout && !attachRetryTimeoutsRef.current.has(newId)) {
        attachRetryTimeoutsRef.current.set(newId, retryTimeout);
        attachRetryTimeoutsRef.current.delete(oldId);
      }
    };

    const resolveParticipantId = (participant: StreamParticipant): string | null => {
      const userId = participant.userId ?? null;
      const participantSessionId = participant.sessionId ?? null;

      if (userId && participantSessionId) {
        const previousCanonicalId = participantAliasRef.current.get(participantSessionId);
        participantAliasRef.current.set(participantSessionId, userId);
        participantAliasRef.current.set(userId, userId);
        if (previousCanonicalId && previousCanonicalId !== userId) {
          migrateParticipantKey(previousCanonicalId, userId);
        } else {
          migrateParticipantKey(participantSessionId, userId);
        }
        return userId;
      }

      if (userId) {
        participantAliasRef.current.set(userId, userId);
        return userId;
      }

      if (participantSessionId) {
        return participantAliasRef.current.get(participantSessionId) ?? participantSessionId;
      }

      return null;
    };

    const bootstrap = async () => {
      try {
        if (!inferenceApiBaseUrl) {
          throw new Error('Inference API base URL is not configured.');
        }

        await ensureAndroidMediaPermissions();

        flWeightsAgentRef.current = new FLWeightsAgent();
        await flWeightsAgentRef.current.initialize();
        receiverSrAgentRef.current = new ReceiverSRAgent();
        await receiverSrAgentRef.current.initialize();

        let deviceInfo: DeviceInfoPayload | null = null;
        try {
          const DeviceInfo = require('react-native-device-info') as {
            getTotalMemory: () => Promise<number>;
            getModel: () => string;
            getSystemVersion: () => string;
          };
          const totalMemory = await DeviceInfo.getTotalMemory();
          const model = DeviceInfo.getModel();
          const version = Number.parseInt(DeviceInfo.getSystemVersion(), 10);
          deviceInfo = {
            ram_gb: Number((totalMemory / 1024 ** 3).toFixed(2)),
            model,
            android_version: Number.isFinite(version) ? version : 0,
          };
        } catch (error) {
          console.warn('[MobCloudX] Device info unavailable for SR telemetry:', error);
        }

        const response = await fetch(`${inferenceApiBaseUrl}/webrtc/session/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            call_id: requestedCallId,
            user_id: `mobcloudx-${Date.now()}`,
            device_info: deviceInfo,
          }),
        });

        if (!response.ok) {
          throw new Error(`Token request failed with status ${response.status}.`);
        }

        const tokenPayload = (await response.json()) as TokenResponse;
        const apiKey = tokenPayload.api_key ?? tokenPayload.apiKey ?? process.env.EXPO_PUBLIC_STREAM_API_KEY ?? '';
        const userId = tokenPayload.user_id ?? tokenPayload.userId ?? `mobcloudx-${Date.now()}`;
        const userName = tokenPayload.userName ?? 'MobCloudX User';
        const resolvedCallId = tokenPayload.call_id ?? requestedCallId;
        const resolvedSessionId = tokenPayload.session_id ?? `${resolvedCallId}-${Date.now()}`;

        if (!apiKey || !tokenPayload.token) {
          throw new Error('Missing Stream API key or token.');
        }

        localParticipantIdRef.current = userId;
        activeSessionId = resolvedSessionId;
        didEndSessionRef.current = false;
        actions.initSession(resolvedCallId, resolvedSessionId);
        setCallId(resolvedCallId);

        activeClient = new StreamVideoClient({
          apiKey,
          user: {
            id: userId,
            name: userName,
          },
          token: tokenPayload.token,
        });

        // Connect the user to Stream
        await activeClient.connectUser(
          {
            id: userId,
            name: userName,
          },
          tokenPayload.token
        );

        activeCall = activeClient.call('default', resolvedCallId);
        const activeCallInternals = activeCall as unknown as CallInternals;
        await activeCallInternals.join({ create: true });

        if (!isMounted) {
          return;
        }

        feedbackCollectorRef.current = new SessionFeedbackCollector(activeCall);
        feedbackCollectorRef.current.startMonitoring();

        setClient(activeClient);
        setCall(activeCall);
        setMode(SDKMode.WEBRTC);

        subscription = activeCallInternals.state.participants$.subscribe((nextParticipants) => {
          void Promise.all(
            nextParticipants.map(async (participant) => {
              const participantId = resolveParticipantId(participant);
              if (!participantId) {
                return;
              }
              await attachParticipant(participantId, activeCallInternals, resolvedSessionId);
            })
          );

          const activeParticipantIds = new Set(
            nextParticipants
              .map((participant) => resolveParticipantId(participant))
              .filter((value): value is string => Boolean(value))
          );

          telemetryAgentsRef.current.forEach((agent, participantId) => {
            if (activeParticipantIds.has(participantId)) {
              actions.updateParticipantMetrics(participantId, agent.getLatestMetrics());
              return;
            }

            agent.stop();
            telemetryAgentsRef.current.delete(participantId);
            unregisterAgent(SDKMode.WEBRTC, `webrtc-${participantId}`);

            const retryTimeout = attachRetryTimeoutsRef.current.get(participantId);
            if (retryTimeout) {
              clearTimeout(retryTimeout);
              attachRetryTimeoutsRef.current.delete(participantId);
            }

            const predictor = predictorsRef.current.get(participantId);
            predictor?.stop();
            void predictor?.destroy();
            predictorsRef.current.delete(participantId);
            adaptationControllersRef.current.delete(participantId);
          });
        });

        setIsJoining(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to join call.';
        if (isMediaPermissionError(error)) {
          Alert.alert(
            'Camera and microphone access required',
            'Enable camera and microphone permissions for MobCloudX to join this WebRTC call.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open settings',
                onPress: () => {
                  void Linking.openSettings();
                },
              },
            ]
          );
        }
        if (isMounted) {
          setErrorMessage(message);
          setIsJoining(false);
        }
      }
    };

    void bootstrap();

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
      telemetryAgentsRef.current.forEach((agent, participantId) => {
        agent.stop();
        unregisterAgent(SDKMode.WEBRTC, `webrtc-${participantId}`);
      });
      telemetryAgentsRef.current.clear();

      predictorsRef.current.forEach((predictor) => {
        predictor.stop();
        void predictor.destroy();
      });
      predictorsRef.current.clear();

      attachRetryTimeoutsRef.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      attachRetryTimeoutsRef.current.clear();

      adaptationControllersRef.current.clear();
      localParticipantIdRef.current = null;
      demoThrottleRef.current.deactivate();
      demoThrottleRef.current.setTargetParticipant(null);
      void receiverSrAgentRef.current?.destroy();
      receiverSrAgentRef.current = null;

      void flushSessionLearning(activeSessionId ?? useWebRTCStore.getState().sessionId);
      actions.endSession();
      setMode(SDKMode.OTT);
      void (activeCall as unknown as CallInternals | null)?.leave();
      void activeClient?.disconnectUser();
    };
  }, [actions, inferenceApiBaseUrl, kafkaPublisher, registerAgent, requestedCallId, setMode, unregisterAgent]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      telemetryAgentsRef.current.forEach((agent, participantId) => {
        const participant = useWebRTCStore.getState().participants.get(participantId);
        const fsmState = participant?.fsmState ?? FSMState.RECOVERY;
        const realMetrics =
          participantId === localParticipantIdRef.current && receiverSrAgentRef.current
            ? receiverSrAgentRef.current.enrichMetrics(agent.getLatestMetrics(), fsmState)
            : agent.getLatestMetrics();
        const metrics = DEMO_MODE_ENABLED
          ? demoThrottleRef.current.interceptMetrics(realMetrics, participantId)
          : realMetrics;
        actions.updateParticipantMetrics(participantId, metrics);
        if (participantId !== localParticipantIdRef.current || !flWeightsAgentRef.current) {
          return;
        }

        const updatedParticipant = useWebRTCStore.getState().participants.get(participantId);
        if (!updatedParticipant) {
          return;
        }

        flWeightsAgentRef.current.recordInterval(realMetrics, updatedParticipant.qoeResult);
      });
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [actions]);

  const handleEndCall = () => {
    telemetryAgentsRef.current.forEach((agent, participantId) => {
      agent.stop();
      unregisterAgent(SDKMode.WEBRTC, `webrtc-${participantId}`);
    });
    telemetryAgentsRef.current.clear();

    predictorsRef.current.forEach((predictor) => {
      predictor.stop();
      void predictor.destroy();
    });
    predictorsRef.current.clear();
    adaptationControllersRef.current.clear();
    demoThrottleRef.current.deactivate();
    demoThrottleRef.current.setTargetParticipant(null);
    void receiverSrAgentRef.current?.destroy();
    receiverSrAgentRef.current = null;

    void flushSessionLearning(sessionId);
    actions.endSession();
    setSelectedParticipantId(null);
    setMode(SDKMode.OTT);
    router.back();
  };

  useEffect(() => {
    if (errorMessage) {
      Alert.alert('WebRTC Error', errorMessage);
    }
  }, [errorMessage]);

  const handleSelectThrottleLevel = (level: ThrottleLevel) => {
    setDemoThrottleLevel(level);
    if (level === 'NONE') {
      demoThrottleRef.current.deactivate();
      return;
    }

    demoThrottleRef.current.activate(level);
  };

  const handleSelectDemoParticipant = (participantId: string) => {
    setDemoParticipantId(participantId);
    demoThrottleRef.current.setTargetParticipant(participantId);
  };

  const handleResetDemo = () => {
    demoThrottleRef.current.deactivate();
    demoThrottleRef.current.setTargetParticipant(null);
    setDemoThrottleLevel('NONE');
    setLastWarningByParticipant({});
  };

  const handleRunProfiler = () => {
    if (isProfiling) {
      return;
    }

    setIsProfiling(true);
    void (async () => {
      try {
        const reports = await performanceProfilerRef.current.measureComponentCost();
        const summary = reports
          .map(
            (report) =>
              `${report.component}: CPU ${report.avg_cpu_percent.toFixed(1)}%, Mem +${report.peak_memory_mb.toFixed(1)}MB, p95 ${report.inference_latency_p95_ms.toFixed(1)}ms`
          )
          .join('\n');

        Alert.alert('Performance Profiler', summary || 'Profiler completed with no samples.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Profiling failed.';
        Alert.alert('Performance Profiler', message);
      } finally {
        setIsProfiling(false);
      }
    })();
  };

  if (isJoining) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <View style={styles.loadingCard}>
            <Text style={styles.loadingEyebrow}>WebRTC Session</Text>
            <Text style={styles.errorTitle}>Joining room</Text>
            <Text style={styles.loadingRoomId}>{requestedCallId}</Text>
            <ActivityIndicator size="large" color="#38bdf8" />
            <Text style={styles.helperText}>
              Preparing Stream, telemetry, FL sync, and participant monitoring for this room.
            </Text>
            <Text style={styles.loadingTip}>
              To add another participant, open the same room ID on a second phone, emulator, or another dev build.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!client || !call) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <View style={styles.loadingCard}>
            <Text style={styles.errorTitle}>Call unavailable</Text>
            <Text style={styles.helperText}>{errorMessage ?? 'Unable to initialize the call session.'}</Text>
            <Text style={styles.loadingTip}>
              Verify Stream credentials, then rejoin room {requestedCallId} from this device or a second one.
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => router.back()}>
              <Text style={styles.primaryButtonText}>Back to Home</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.header}>
                <View style={styles.headerCopy}>
                  <Text style={styles.title}>MobCloudX Live Collaboration</Text>
                  <Text style={styles.subtitle}>Room: {callId}</Text>
                  <Text style={styles.headerMeta}>
                    Share this room ID with another device or emulator to join the same WebRTC call.
                  </Text>
                </View>
                <View style={styles.headerActions}>
                  {sessionId ? (
                    <Pressable
                      style={styles.replayButton}
                      onPress={() =>
                        router.push({
                          pathname: '/replay' as never,
                          params: { sessionId },
                        } as never)
                      }
                    >
                      <Text style={styles.replayButtonText}>Replay</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={styles.endButton} onPress={handleEndCall}>
                    <Text style={styles.endButtonText}>End</Text>
                  </Pressable>
                </View>
              </View>

              <View style={[styles.callSurface, { height: callSurfaceHeight }]}>
                <CallContent />
              </View>

              <View style={styles.instructionsCard}>
                <Text style={styles.instructionsEyebrow}>Test Setup</Text>
                <Text style={styles.instructionsTitle}>Add a second participant</Text>
                <Text style={styles.instructionsText}>
                  Open room {callId} on one more device, an Android emulator, or another dev build using the same
                  producer and inference URLs. Both participants must use the same room ID to meet in the call.
                </Text>
              </View>

              <View style={[styles.hudContainer, compactLayout ? styles.hudContainerStacked : null]}>
                {demoParticipants.length === 0 ? (
                  <View style={styles.emptyStateCard}>
                    <Text style={styles.hudName}>Waiting for participants</Text>
                    <Text style={styles.helperText}>
                      You are in the room. Join the same room from another device to populate QoE cards here.
                    </Text>
                  </View>
                ) : (
                  demoParticipants.map((participant, index) => (
                    <ParticipantHudBadge
                      key={participant.participantId}
                      participant={participant}
                      displayName={getParticipantDisplayName(
                        participant.participantId,
                        localParticipantIdRef.current,
                        index
                      )}
                      onPress={() => setSelectedParticipantId(participant.participantId)}
                    />
                  ))
                )}
              </View>

              {DEMO_MODE_ENABLED ? (
                <DemoControlsPanel
                  isExpanded={isDemoPanelExpanded}
                  onToggle={() => setIsDemoPanelExpanded((current) => !current)}
                  throttleLevel={demoThrottleLevel}
                  onSelectThrottle={handleSelectThrottleLevel}
                  participants={demoParticipants}
                  selectedParticipantId={demoParticipantId}
                  onSelectParticipant={handleSelectDemoParticipant}
                  selectedParticipant={selectedDemoParticipant}
                  lastWarningTimestamp={lastDemoWarningTimestamp}
                  currentWeights={currentFlWeights}
                  resolveParticipantLabel={(participant, index) =>
                    getParticipantDisplayName(
                      participant.participantId,
                      localParticipantIdRef.current,
                      index
                    )
                  }
                  onReset={handleResetDemo}
                  onRunProfiler={handleRunProfiler}
                  isProfiling={isProfiling}
                />
              ) : null}
            </ScrollView>

            {showModelToast ? (
              <View style={styles.flToast}>
                <Text style={styles.flToastText}>Model updated</Text>
              </View>
            ) : null}

            <Modal
              animationType="fade"
              transparent
              visible={selectedParticipant !== null}
              onRequestClose={() => setSelectedParticipantId(null)}
            >
              <Pressable style={styles.modalBackdrop} onPress={() => setSelectedParticipantId(null)}>
                <Pressable style={styles.modalCard} onPress={() => undefined}>
                  {selectedParticipant ? (
                    <>
                      <Text style={styles.modalTitle}>
                        {getParticipantDisplayName(
                          selectedParticipant.participantId,
                          localParticipantIdRef.current,
                          demoParticipants.findIndex(
                            (participant) => participant.participantId === selectedParticipant.participantId
                          )
                        )}
                      </Text>
                      <Text style={styles.modalSubtitle}>
                        {selectedParticipant.fsmState} · {getResolutionAndFps(selectedParticipant)}
                      </Text>
                      <Text style={styles.modalSubtitleMuted}>
                        ID: {selectedParticipant.participantId}
                      </Text>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>QoE Score</Text>
                        <Text style={styles.breakdownValue}>{selectedParticipant.qoeScore.toFixed(1)}</Text>
                      </View>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Congestion</Text>
                        <Text style={styles.breakdownValue}>
                          {selectedParticipant.latestCongestionProbability !== null
                            ? `${(selectedParticipant.latestCongestionProbability * 100).toFixed(0)}%`
                            : '--'}
                        </Text>
                      </View>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Predicted Bitrate</Text>
                        <Text style={styles.breakdownValue}>
                          {selectedParticipant.latestPredictedBitrateKbps !== null
                            ? `${selectedParticipant.latestPredictedBitrateKbps.toFixed(0)} kbps`
                            : '--'}
                        </Text>
                      </View>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Video</Text>
                        <Text style={styles.breakdownValue}>
                          {(selectedParticipant.qoeResult.videoScore * 100).toFixed(1)}
                        </Text>
                      </View>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Audio</Text>
                        <Text style={styles.breakdownValue}>
                          {(selectedParticipant.qoeResult.audioScore * 100).toFixed(1)}
                        </Text>
                      </View>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>RTT Penalty</Text>
                        <Text style={styles.breakdownValue}>
                          {selectedParticipant.qoeResult.rttPenalty.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Jitter Penalty</Text>
                        <Text style={styles.breakdownValue}>
                          {selectedParticipant.qoeResult.jitterPenalty.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Freeze Penalty</Text>
                        <Text style={styles.breakdownValue}>
                          {selectedParticipant.qoeResult.freezePenalty.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>BRISQUE</Text>
                        <Text style={styles.breakdownValue}>
                          {selectedParticipant.qoeResult.brisqueScore !== null
                            ? selectedParticipant.qoeResult.brisqueScore.toFixed(1)
                            : '--'}
                        </Text>
                      </View>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Receiver SR</Text>
                        <Text style={styles.breakdownValue}>
                          {selectedParticipant.qoeResult.srActive ? 'Active' : 'Inactive'}
                        </Text>
                      </View>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Dominant Issue</Text>
                        <Text style={styles.breakdownValue}>
                          {selectedParticipant.qoeResult.dominantIssue}
                        </Text>
                      </View>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Recommended Action</Text>
                        <Text style={styles.breakdownValue}>
                          {selectedParticipant.lastTransition?.recommendedAction.targetResolution ??
                            getResolutionLabel(selectedParticipant.latestMetrics.frameHeight)}
                        </Text>
                      </View>
                      <Pressable style={styles.primaryButton} onPress={() => setSelectedParticipantId(null)}>
                        <Text style={styles.primaryButtonText}>Close</Text>
                      </Pressable>
                    </>
                  ) : null}
                </Pressable>
              </Pressable>
            </Modal>
          </View>
        </SafeAreaView>
      </StreamCall>
    </StreamVideo>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 96,
    gap: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  loadingCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.28)',
    padding: 24,
    gap: 14,
  },
  loadingEyebrow: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  loadingRoomId: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingTip: {
    color: '#cbd5e1',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalSubtitleMuted: {
    color: '#64748b',
    marginTop: -8,
    marginBottom: 12,
    fontSize: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerCopy: {
    flex: 1,
    minWidth: 220,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#94a3b8',
    marginTop: 4,
  },
  headerMeta: {
    color: '#64748b',
    marginTop: 8,
    maxWidth: 520,
    lineHeight: 20,
  },
  callSurface: {
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    backgroundColor: '#0b1120',
  },
  hudContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  hudContainerStacked: {
    flexDirection: 'column',
  },
  demoPanel: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    padding: 14,
    gap: 10,
  },
  demoPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  demoPanelTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  demoPanelSubtitle: {
    color: '#94a3b8',
    marginTop: 4,
    fontSize: 11,
  },
  demoPanelToggle: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  demoLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  demoSegmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  demoSegment: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  demoSegmentActive: {
    backgroundColor: '#0c4a6e',
    borderColor: '#38bdf8',
  },
  demoSegmentText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  demoSegmentTextActive: {
    color: '#e0f2fe',
  },
  demoParticipantRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  demoParticipantChip: {
    borderRadius: 999,
    backgroundColor: '#172033',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  demoParticipantChipActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#60a5fa',
  },
  demoParticipantChipText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  demoParticipantChipTextActive: {
    color: '#eff6ff',
  },
  demoReactionCard: {
    borderRadius: 14,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    padding: 12,
    gap: 6,
  },
  demoReactionTitle: {
    color: '#f8fafc',
    fontWeight: '800',
    marginBottom: 4,
  },
  demoReactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  demoReactionLabel: {
    color: '#94a3b8',
    fontSize: 11,
  },
  demoReactionValue: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  demoActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  demoSecondaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#475569',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  demoSecondaryButtonDisabled: {
    opacity: 0.6,
  },
  demoSecondaryButtonText: {
    color: '#cbd5e1',
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 12,
  },
  demoPrimaryButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  demoPrimaryButtonText: {
    color: '#fff',
    fontWeight: '800',
    textAlign: 'center',
    fontSize: 12,
  },
  hudBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.6)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 168,
    flexGrow: 1,
  },
  emptyStateCard: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.6)',
    padding: 16,
    gap: 8,
  },
  hudTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hudName: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  hudScore: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  hudMeta: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  hudState: {
    color: '#cbd5e1',
    fontSize: 10,
    marginTop: 4,
  },
  hudPrediction: {
    color: '#bfdbfe',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '700',
  },
  warningPulse: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#ef4444',
  },
  flToast: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.95)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  flToastText: {
    color: '#022c22',
    fontWeight: '800',
    fontSize: 12,
  },
  endButton: {
    backgroundColor: '#dc2626',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  replayButton: {
    backgroundColor: '#0f766e',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  replayButtonText: {
    color: '#ecfeff',
    fontWeight: '700',
  },
  endButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
  },
  helperText: {
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
  },
  instructionsCard: {
    borderRadius: 24,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.24)',
    padding: 18,
    gap: 8,
  },
  instructionsEyebrow: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  instructionsTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  instructionsText: {
    color: '#cbd5e1',
    lineHeight: 21,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: '#94a3b8',
    marginTop: 6,
    marginBottom: 18,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148, 163, 184, 0.22)',
  },
  breakdownLabel: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  breakdownValue: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 150,
    textAlign: 'right',
  },
});
