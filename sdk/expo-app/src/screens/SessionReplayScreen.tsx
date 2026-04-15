import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSDKStore } from '../core/store';
import { getInferenceApiBaseUrl } from '../core/api-config';
import { getResolutionLabel } from '../sdk/webrtc/WebRTCQoEModel';

interface ReplayTelemetryPoint {
  participant_id?: string;
  timestamp: number;
  qoe_score?: number;
  fsm_state?: string;
  frameHeight?: number;
  framesPerSecond?: number;
  sr_active?: boolean;
  congestion_probability?: number | null;
  qualityLimitationReason?: string;
  brisque_score?: number | null;
}

interface ReplayAdaptationPoint {
  timestamp: number;
  participant_id?: string;
  trigger?: string;
  decision_type?: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
}

interface ReplayResponse {
  session_id: string;
  call_id?: string;
  participants: Record<string, ReplayTelemetryPoint[]>;
  adaptations?: ReplayAdaptationPoint[];
}

interface TimelineMarker {
  ratio: number;
  color: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) {
    return '--';
  }

  return new Date(timestamp).toLocaleTimeString();
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function buildMarkers(
  participants: Record<string, ReplayTelemetryPoint[]>,
  adaptations: ReplayAdaptationPoint[],
  minTimestamp: number,
  durationMs: number
): TimelineMarker[] {
  if (durationMs <= 0) {
    return [];
  }

  const markers: TimelineMarker[] = [];

  Object.values(participants).forEach((entries) => {
    entries.forEach((entry, index) => {
      const previous = index > 0 ? entries[index - 1] : null;
      const ratio = clamp((entry.timestamp - minTimestamp) / durationMs, 0, 1);

      if (previous && previous.fsm_state !== entry.fsm_state) {
        markers.push({ ratio, color: '#ef4444' });
      }

      if ((entry.congestion_probability ?? 0) >= 0.5) {
        markers.push({ ratio, color: '#f59e0b' });
      }

      if (entry.sr_active && !previous?.sr_active) {
        markers.push({ ratio, color: '#3b82f6' });
      }
    });
  });

  adaptations.forEach((adaptation) => {
    markers.push({
      ratio: clamp((adaptation.timestamp - minTimestamp) / durationMs, 0, 1),
      color: '#8b5cf6',
    });
  });

  return markers;
}

function findNearestEntry(entries: ReplayTelemetryPoint[], timestamp: number): ReplayTelemetryPoint | null {
  if (entries.length === 0) {
    return null;
  }

  return entries.reduce((closest, current) =>
    Math.abs(current.timestamp - timestamp) < Math.abs(closest.timestamp - timestamp) ? current : closest
  );
}

function ReplayParticipantCard({
  participantId,
  entry,
  adaptations,
}: {
  participantId: string;
  entry: ReplayTelemetryPoint | null;
  adaptations: ReplayAdaptationPoint[];
}): JSX.Element {
  const qoeScore = entry?.qoe_score ?? 0;
  const qualityColor = qoeScore >= 75 ? '#10b981' : qoeScore >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <View style={styles.participantCard}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.participantTitle}>{participantId}</Text>
        <Text style={[styles.participantScore, { color: qualityColor }]}>QoE {Math.round(qoeScore)}</Text>
      </View>
      <Text style={styles.cardMeta}>{entry?.fsm_state ?? 'No FSM data'}</Text>
      <Text style={styles.cardMeta}>
        {getResolutionLabel(entry?.frameHeight ?? 0)} · {Math.round(entry?.framesPerSecond ?? 0)}fps
      </Text>
      <Text style={styles.cardMeta}>SR {entry?.sr_active ? 'Active' : 'Inactive'}</Text>
      <Text style={styles.cardMeta}>
        LSTM {(entry?.congestion_probability ?? 0) > 0 ? `${Math.round((entry?.congestion_probability ?? 0) * 100)}%` : '--'}
      </Text>
      <Text style={styles.cardMeta}>
        BRISQUE {typeof entry?.brisque_score === 'number' ? entry.brisque_score.toFixed(1) : '--'}
      </Text>
      <Text style={styles.cardMeta}>
        Adaptation{' '}
        {adaptations.length > 0
          ? adaptations.map((item) => item.decision_type ?? item.trigger ?? 'event').join(', ')
          : 'None'}
      </Text>
    </View>
  );
}

export default function SessionReplayScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const inferenceApiBaseUrl = useSDKStore((state) => getInferenceApiBaseUrl(state.config));
  const [response, setResponse] = useState<ReplayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [scrubIndex, setScrubIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadReplay = async (): Promise<void> => {
      try {
        if (!inferenceApiBaseUrl) {
          throw new Error('Inference API base URL is not configured.');
        }

        if (!params.sessionId) {
          throw new Error('Missing sessionId for replay.');
        }

        const replayResponse = await fetch(`${inferenceApiBaseUrl}/webrtc/session/${params.sessionId}/metrics`);
        if (!replayResponse.ok) {
          throw new Error(`Replay request failed with status ${replayResponse.status}.`);
        }

        const payload = (await replayResponse.json()) as ReplayResponse;
        if (isMounted) {
          setResponse(payload);
          setLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load replay.');
          setLoading(false);
        }
      }
    };

    void loadReplay();

    return () => {
      isMounted = false;
    };
  }, [inferenceApiBaseUrl, params.sessionId]);

  const participantIds = useMemo(
    () => Object.keys(response?.participants ?? {}).slice(0, 2),
    [response]
  );

  const timelineEntries = useMemo(() => {
    const entries = participantIds.flatMap((participantId) => response?.participants[participantId] ?? []);
    return entries.sort((left, right) => left.timestamp - right.timestamp);
  }, [participantIds, response]);

  const minTimestamp = timelineEntries[0]?.timestamp ?? 0;
  const maxTimestamp = timelineEntries[timelineEntries.length - 1]?.timestamp ?? minTimestamp;
  const durationMs = Math.max(maxTimestamp - minTimestamp, 0);
  const durationSeconds = durationMs / 1000;
  const effectiveIndex = timelineEntries.length > 0 ? clamp(scrubIndex, 0, timelineEntries.length - 1) : 0;
  const currentTimestamp = timelineEntries[effectiveIndex]?.timestamp ?? minTimestamp;

  useEffect(() => {
    if (!autoPlay || timelineEntries.length === 0) {
      return;
    }

    const intervalId = setInterval(() => {
      setScrubIndex((current) => {
        if (current >= timelineEntries.length - 1) {
          return 0;
        }
        return current + 1;
      });
    }, 100);

    return () => {
      clearInterval(intervalId);
    };
  }, [autoPlay, timelineEntries.length]);

  const participantSnapshots = useMemo(
    () =>
      participantIds.map((participantId) => ({
        participantId,
        entry: findNearestEntry(response?.participants[participantId] ?? [], currentTimestamp),
      })),
    [currentTimestamp, participantIds, response]
  );

  const visibleAdaptations = useMemo(() => {
    return (response?.adaptations ?? []).filter((adaptation) => Math.abs(adaptation.timestamp - currentTimestamp) <= 1000);
  }, [currentTimestamp, response]);

  const markers = useMemo(
    () => buildMarkers(response?.participants ?? {}, response?.adaptations ?? [], minTimestamp, durationMs),
    [durationMs, minTimestamp, response]
  );

  const scrubToRatio = (ratio: number): void => {
    if (timelineEntries.length === 0) {
      return;
    }

    const nextIndex = Math.round(clamp(ratio, 0, 1) * (timelineEntries.length - 1));
    setScrubIndex(nextIndex);
  };

  const handleTrackLayout = (event: LayoutChangeEvent): void => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          if (!trackWidth) {
            return;
          }
          scrubToRatio(event.nativeEvent.locationX / trackWidth);
        },
        onPanResponderMove: (event) => {
          if (!trackWidth) {
            return;
          }
          scrubToRatio(event.nativeEvent.locationX / trackWidth);
        },
      }),
    [trackWidth, timelineEntries.length]
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.helperText}>Loading session replay...</Text>
      </View>
    );
  }

  if (errorMessage || !response) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Replay unavailable</Text>
        <Text style={styles.helperText}>{errorMessage ?? 'No replay data found.'}</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Session Replay</Text>
          <Text style={styles.subtitle}>{response.session_id}</Text>
          <Text style={styles.caption}>2-participant demo replay at 10x speed</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Close</Text>
        </Pressable>
      </View>

      <View style={styles.timelineCard}>
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineTitle}>Timeline</Text>
          <Text style={styles.timelineMeta}>
            {formatDuration((currentTimestamp - minTimestamp) / 1000)} / {formatDuration(durationSeconds)}
          </Text>
        </View>
        <View style={styles.timelineTrack} onLayout={handleTrackLayout} {...panResponder.panHandlers}>
          <View style={styles.timelineLine} />
          {markers.map((marker, index) => (
            <View
              key={`${marker.color}-${marker.ratio}-${index}`}
              style={[
                styles.timelineMarker,
                {
                  left: `${marker.ratio * 100}%`,
                  backgroundColor: marker.color,
                },
              ]}
            />
          ))}
          <View
            style={[
              styles.timelineThumb,
              {
                left:
                  timelineEntries.length > 1
                    ? `${(effectiveIndex / (timelineEntries.length - 1)) * 100}%`
                    : '0%',
              },
            ]}
          />
        </View>
        <View style={styles.timelineLegend}>
          <Text style={styles.legendItem}>Red: FSM</Text>
          <Text style={styles.legendItem}>Orange: LSTM</Text>
          <Text style={styles.legendItem}>Purple: Adapt</Text>
          <Text style={styles.legendItem}>Blue: SR</Text>
        </View>
        <View style={styles.controlsRow}>
          <Pressable style={styles.secondaryButton} onPress={() => setScrubIndex((current) => Math.max(current - 1, 0))}>
            <Text style={styles.secondaryButtonText}>-1s</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => setAutoPlay((current) => !current)}>
            <Text style={styles.secondaryButtonText}>{autoPlay ? 'Pause' : 'Auto-play 10x'}</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => setScrubIndex((current) => Math.min(current + 1, Math.max(timelineEntries.length - 1, 0)))}
          >
            <Text style={styles.secondaryButtonText}>+1s</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.grid}>
        {participantSnapshots.map(({ participantId, entry }) => (
          <ReplayParticipantCard
            key={participantId}
            participantId={participantId}
            entry={entry}
            adaptations={visibleAdaptations.filter((adaptation) => adaptation.participant_id === participantId)}
          />
        ))}
      </View>

      <View style={styles.eventCard}>
        <Text style={styles.eventTitle}>Events At {formatTimestamp(currentTimestamp)}</Text>
        {visibleAdaptations.length === 0 ? (
          <Text style={styles.helperText}>No adaptation decision recorded at this point.</Text>
        ) : (
          visibleAdaptations.map((adaptation, index) => (
            <View key={`${adaptation.timestamp}-${index}`} style={styles.eventRow}>
              <Text style={styles.eventLabel}>{adaptation.participant_id ?? 'participant'}</Text>
              <Text style={styles.eventValue}>
                {adaptation.decision_type ?? adaptation.trigger ?? 'adaptation'}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 28,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020617',
    padding: 24,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    gap: 12,
  },
  title: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: '#94a3b8',
    marginTop: 4,
  },
  caption: {
    color: '#38bdf8',
    marginTop: 6,
    fontSize: 12,
  },
  timelineCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  timelineTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  timelineMeta: {
    color: '#cbd5e1',
  },
  timelineTrack: {
    height: 32,
    justifyContent: 'center',
    position: 'relative',
  },
  timelineLine: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#1e293b',
  },
  timelineThumb: {
    position: 'absolute',
    top: 5,
    width: 18,
    height: 18,
    borderRadius: 999,
    marginLeft: -9,
    backgroundColor: '#38bdf8',
  },
  timelineMarker: {
    position: 'absolute',
    top: 8,
    width: 6,
    height: 12,
    borderRadius: 999,
    marginLeft: -3,
  },
  timelineLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  legendItem: {
    color: '#94a3b8',
    fontSize: 11,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  participantCard: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    minHeight: 180,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  participantTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  participantScore: {
    fontWeight: '800',
  },
  cardMeta: {
    color: '#cbd5e1',
    marginTop: 6,
    fontSize: 12,
  },
  eventCard: {
    marginTop: 18,
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  eventTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148, 163, 184, 0.18)',
  },
  eventLabel: {
    color: '#cbd5e1',
  },
  eventValue: {
    color: '#f8fafc',
    fontWeight: '700',
    maxWidth: 200,
    textAlign: 'right',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111c34',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 12,
  },
  helperText: {
    color: '#94a3b8',
    textAlign: 'center',
  },
  errorTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
  },
});
