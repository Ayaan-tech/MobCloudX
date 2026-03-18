// ─────────────────────────────────────────────────────────────
// MobCloudX Demo — Before/After Quality Comparison Screen
// Shows original 360p vs enhanced adaptive resolutions
// with VMAF/QoE badges and federated learning metrics
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';

// ── S3 Production bucket URLs ──────────────────────────────
const S3_PROD = 'https://prod.mobcloudx.xyz';
const S3_DEV = 'https://video-transcoding-mob.mobcloudx.xyz';

// ── Resolution data ────────────────────────────────────────
const ORIGINAL = {
  resolution: '360p',
  width: 640,
  height: 360,
  bitrate: '325 kbps',
  fps: 29.97,
  vmaf: 38,
  vmafLabel: 'Poor',
  qoe: 52,
  qoeLabel: 'Laggy',
  description: 'Blurry 360p Video & Laggy Playback',
};

const ENHANCED = [
  {
    resolution: '480p',
    width: 854,
    height: 480,
    bitrate: '1500 kbps',
    fps: 30,
    vmaf: 68,
    vmafLabel: 'Fair',
    qoe: 65,
    qoeLabel: 'Fair',
    description: 'Cleaner 480p Video & Fair Playback',
  },
  {
    resolution: '720p',
    width: 1280,
    height: 720,
    bitrate: '3500 kbps',
    fps: 30,
    vmaf: 82,
    vmafLabel: 'Good',
    qoe: 78,
    qoeLabel: 'Fair',
    description: 'Sharper Adaptive 720p Video & Smooth Playback',
  },
  {
    resolution: '1080p',
    width: 1920,
    height: 1080,
    bitrate: '6000 kbps',
    fps: 30,
    vmaf: 92,
    vmafLabel: 'Excellent',
    qoe: 85,
    qoeLabel: 'Smooth',
    description: 'Crystal Clear 1080p Video & Smooth Playback',
  },
];

const FL_METRICS = {
  sessions: 12,
  bufferEvents: 3,
  adaptationDecisions: 7,
  avgFps: 29.8,
  networkWifi: 80,
};

// ── Color helpers ──────────────────────────────────────────
function vmafColors(score: number) {
  if (score >= 90) return { bg: '#059669', text: '#fff' };
  if (score >= 75) return { bg: '#16a34a', text: '#fff' };
  if (score >= 60) return { bg: '#ca8a04', text: '#fff' };
  return { bg: '#dc2626', text: '#fff' };
}

function qoeColors(score: number) {
  if (score >= 80) return { bg: '#059669', text: '#fff' };
  if (score >= 60) return { bg: '#2563eb', text: '#fff' };
  if (score >= 40) return { bg: '#ca8a04', text: '#fff' };
  return { bg: '#dc2626', text: '#fff' };
}

// ── Score Badge ────────────────────────────────────────────
function Badge({ label, score, sublabel, colorFn }: {
  label: string;
  score: number;
  sublabel: string;
  colorFn: (s: number) => { bg: string; text: string };
}) {
  const c = colorFn(score);
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLabel}>{label}</Text>
      <View style={[styles.badgeScore, { backgroundColor: c.bg }]}>
        <Text style={[styles.badgeScoreText, { color: c.text }]}>{score}</Text>
      </View>
      <View style={[styles.badgeSublabel, { backgroundColor: c.bg + '40' }]}>
        <Text style={[styles.badgeSublabelText, { color: c.bg }]}>{sublabel}</Text>
      </View>
    </View>
  );
}

// ── Video Card ─────────────────────────────────────────────
function VideoCard({
  data,
  title,
  isOriginal,
}: {
  data: typeof ORIGINAL;
  title: string;
  isOriginal?: boolean;
}) {
  const accent = isOriginal ? '#dc2626' : '#059669';
  return (
    <View style={[styles.videoCard, { borderColor: accent + '30' }]}>
      {/* Header */}
      <View style={[styles.videoCardHeader, { backgroundColor: accent + '10' }]}>
        <Text style={[styles.videoCardTitle, { color: accent }]}>{title}</Text>
        <Text style={styles.videoCardMeta}>
          {data.width}×{data.height} • {data.bitrate} • {data.fps}fps
        </Text>
      </View>

      {/* Thumbnail placeholder (gradient) */}
      <View style={[styles.thumbnailContainer, { backgroundColor: isOriginal ? '#1a0505' : '#051a0f' }]}>
        <View style={[styles.resolutionTag, { backgroundColor: accent + 'CC' }]}>
          <Text style={styles.resolutionTagText}>{data.resolution.toUpperCase()}</Text>
        </View>
        <View style={styles.playOverlay}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
      </View>

      {/* Scores */}
      <View style={styles.scoresRow}>
        <Badge label="VMAF" score={data.vmaf} sublabel={data.vmafLabel} colorFn={vmafColors} />
        <Badge label="QoE" score={data.qoe} sublabel={data.qoeLabel} colorFn={qoeColors} />
      </View>

      {/* Description */}
      <Text style={[styles.videoDescription, { color: isOriginal ? '#fca5a5' : '#6ee7b7' }]}>
        {data.description}
      </Text>
    </View>
  );
}

// ── FL Metric Card ─────────────────────────────────────────
function FLCard({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return (
    <View style={styles.flCard}>
      <Text style={styles.flIcon}>{icon}</Text>
      <Text style={styles.flLabel}>{label}</Text>
      <Text style={styles.flValue}>{value}</Text>
      {sub && <Text style={styles.flSub}>{sub}</Text>}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────
export default function ComparisonScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [selectedRes, setSelectedRes] = useState(1); // index into ENHANCED (0=480, 1=720, 2=1080)
  const selected = ENHANCED[selectedRes];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.pageTitle}>Before / After</Text>
          <Text style={styles.pageSubtitle}>Original vs ESRGAN-Enhanced Quality</Text>
        </View>

        {/* Resolution Tabs */}
        <View style={styles.tabRow}>
          {ENHANCED.map((e, i) => (
            <Pressable
              key={e.resolution}
              onPress={() => setSelectedRes(i)}
              style={[
                styles.tab,
                selectedRes === i && styles.tabActive,
              ]}
            >
              <Text style={[
                styles.tabText,
                selectedRes === i && styles.tabTextActive,
              ]}>
                {e.resolution.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Comparison Cards */}
        <VideoCard data={ORIGINAL} title="Original Upload" isOriginal />

        {/* Arrow */}
        <View style={styles.arrowContainer}>
          <View style={styles.arrowLine} />
          <View style={styles.arrowBadge}>
            <Text style={styles.arrowText}>
              VMAF +{selected.vmaf - ORIGINAL.vmaf} • QoE +{selected.qoe - ORIGINAL.qoe}
            </Text>
          </View>
          <View style={styles.arrowLine} />
        </View>

        <VideoCard data={selected} title={`Adaptive ${selected.resolution.toUpperCase()}`} />

        {/* Comparison Table */}
        <View style={styles.tableContainer}>
          <Text style={styles.sectionTitle}>📊 Detailed Metrics</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCell, styles.tableCellHeader, { flex: 1.2 }]}>Res</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader]}>VMAF</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader]}>QoE</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader]}>Bitrate</Text>
            <Text style={[styles.tableCell, styles.tableCellHeader]}>FPS</Text>
          </View>
          {/* Original row */}
          <View style={[styles.tableRow, { backgroundColor: '#dc262610' }]}>
            <Text style={[styles.tableCell, { flex: 1.2, color: '#fca5a5' }]}>{ORIGINAL.resolution}</Text>
            <Text style={[styles.tableCell, { color: '#dc2626' }]}>{ORIGINAL.vmaf}</Text>
            <Text style={[styles.tableCell, { color: '#ca8a04' }]}>{ORIGINAL.qoe}</Text>
            <Text style={styles.tableCell}>{ORIGINAL.bitrate}</Text>
            <Text style={styles.tableCell}>{ORIGINAL.fps}</Text>
          </View>
          {/* Enhanced rows */}
          {ENHANCED.map((e, i) => (
            <Pressable key={e.resolution} onPress={() => setSelectedRes(i)}>
              <View style={[styles.tableRow, selectedRes === i && { backgroundColor: '#2563eb15' }]}>
                <Text style={[styles.tableCell, { flex: 1.2, color: selectedRes === i ? '#60a5fa' : '#6ee7b7' }]}>
                  {e.resolution}{selectedRes === i ? ' ✓' : ''}
                </Text>
                <Text style={[styles.tableCell, { color: e.vmaf >= 90 ? '#34d399' : e.vmaf >= 75 ? '#4ade80' : '#facc15' }]}>
                  {e.vmaf}
                </Text>
                <Text style={[styles.tableCell, { color: e.qoe >= 80 ? '#34d399' : '#60a5fa' }]}>
                  {e.qoe}
                </Text>
                <Text style={styles.tableCell}>{e.bitrate}</Text>
                <Text style={styles.tableCell}>{e.fps}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* FL Metrics */}
        <View style={styles.flContainer}>
          <Text style={styles.sectionTitle}>⚡ Federated Learning Metrics</Text>
          <Text style={styles.flSubtitle}>Aggregated from SDK sessions</Text>
          <View style={styles.flGrid}>
            <FLCard icon="📱" label="Sessions" value={FL_METRICS.sessions} sub="Active devices" />
            <FLCard icon="📶" label="Buffer Events" value={FL_METRICS.bufferEvents} sub="Rebuffering" />
            <FLCard icon="🔄" label="Adaptations" value={FL_METRICS.adaptationDecisions} sub="Res switches" />
            <FLCard icon="🎬" label="Avg FPS" value={FL_METRICS.avgFps} sub="All sessions" />
            <FLCard icon="📡" label="WiFi" value={`${FL_METRICS.networkWifi}%`} sub="vs Cellular" />
          </View>
        </View>

        {/* Pipeline banner */}
        <View style={styles.pipelineBanner}>
          <Text style={styles.pipelineText}>
            Pipeline: Pre-sharpen → ESRGAN animevideov3 4× → CAS → Transcode
          </Text>
          <Text style={styles.pipelineSub}>
            SDK → Producer → Kafka → Consumer → MongoDB Atlas
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  scrollContent: { paddingBottom: 40 },
  header: { paddingHorizontal: 20, paddingTop: 16 },
  backBtn: { paddingVertical: 8 },
  backText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  pageTitle: { color: '#f8fafc', fontSize: 24, fontWeight: '800', marginTop: 8 },
  pageSubtitle: { color: '#64748b', fontSize: 13, marginTop: 4 },

  // Tabs
  tabRow: { flexDirection: 'row', marginHorizontal: 20, marginTop: 20, backgroundColor: '#0f172a', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#2563eb' },
  tabText: { color: '#64748b', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#fff' },

  // Video card
  videoCard: { marginHorizontal: 20, marginTop: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden', backgroundColor: '#0f172a' },
  videoCardHeader: { paddingHorizontal: 16, paddingVertical: 10 },
  videoCardTitle: { fontSize: 16, fontWeight: '800' },
  videoCardMeta: { color: '#64748b', fontSize: 11, marginTop: 2 },
  thumbnailContainer: { aspectRatio: 16 / 9, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  resolutionTag: { position: 'absolute', bottom: 10, left: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  resolutionTagText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  playOverlay: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  playIcon: { color: '#fff', fontSize: 20, marginLeft: 3 },
  scoresRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14 },
  videoDescription: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 8, fontSize: 12, fontStyle: 'italic' },

  // Badge
  badge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e293b', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  badgeLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  badgeScore: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, minWidth: 32, alignItems: 'center' },
  badgeScoreText: { fontSize: 16, fontWeight: '900' },
  badgeSublabel: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeSublabelText: { fontSize: 9, fontWeight: '700' },

  // Arrow
  arrowContainer: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginVertical: 8 },
  arrowLine: { flex: 1, height: 1, backgroundColor: '#1e293b' },
  arrowBadge: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#2563eb20', borderRadius: 8, borderWidth: 1, borderColor: '#2563eb30', marginHorizontal: 8 },
  arrowText: { color: '#60a5fa', fontSize: 11, fontWeight: '700' },

  // Table
  tableContainer: { marginHorizontal: 20, marginTop: 20, backgroundColor: '#0f172a', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#1e293b' },
  sectionTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#1e293b', paddingVertical: 8 },
  tableCellHeader: { color: '#64748b', fontWeight: '700', fontSize: 10, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#1e293b10', paddingVertical: 10 },
  tableCell: { flex: 1, color: '#94a3b8', fontSize: 12, textAlign: 'center', fontVariant: ['tabular-nums'] },

  // FL Metrics
  flContainer: { marginHorizontal: 20, marginTop: 20, backgroundColor: '#0f172a', borderRadius: 16, paddingBottom: 16, borderWidth: 1, borderColor: '#1e293b' },
  flSubtitle: { color: '#64748b', fontSize: 11, paddingHorizontal: 16, marginBottom: 12 },
  flGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12 },
  flCard: { width: '30%', backgroundColor: '#1e293b', borderRadius: 10, padding: 10, alignItems: 'center', flexGrow: 1 },
  flIcon: { fontSize: 18 },
  flLabel: { color: '#64748b', fontSize: 9, fontWeight: '600', marginTop: 4, textTransform: 'uppercase' },
  flValue: { color: '#f8fafc', fontSize: 20, fontWeight: '800', marginTop: 2 },
  flSub: { color: '#475569', fontSize: 9, marginTop: 2 },

  // Pipeline
  pipelineBanner: { marginHorizontal: 20, marginTop: 16, backgroundColor: '#1e293b', borderRadius: 12, padding: 14 },
  pipelineText: { color: '#94a3b8', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  pipelineSub: { color: '#475569', fontSize: 10, textAlign: 'center', marginTop: 4 },
});
