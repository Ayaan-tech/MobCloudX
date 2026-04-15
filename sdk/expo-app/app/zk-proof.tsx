import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import type { ZKProofRecord } from '../src/types';

const INFERENCE_URL =
  process.env.EXPO_PUBLIC_INFERENCE_URL?.replace(/\/$/, '') ?? 'http://10.0.2.2:8000';

type LedgerEntry = {
  action: string;
  session_id: string;
  proof_hash?: string;
  proof_mode?: string;
  verified?: boolean;
  ts: number;
};

export default function ZKProofScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const [proof, setProof] = useState<ZKProofRecord | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setError('Missing session id.');
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${INFERENCE_URL}/zk/session/${sessionId}/ledger`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.detail || 'Unable to load ledger');
        }
        if (active) {
          setProof((data.proof ?? null) as ZKProofRecord | null);
          setEntries(Array.isArray(data.entries) ? data.entries as LedgerEntry[] : []);
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message ?? 'Unable to load ledger');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [sessionId]);

  const summaryRows = useMemo(() => {
    if (!proof) return [];
    return [
      ['Start QoE', proof.payload.qoe_start],
      ['Minimum QoE', proof.payload.qoe_minimum],
      ['Recovery QoE', proof.payload.qoe_recovery],
      ['Stall Count', proof.payload.stall_count],
      ['Session Duration', `${proof.payload.session_duration}s`],
      ['SLA Threshold', proof.payload.sla_threshold],
    ];
  }, [proof]);

  const proofHashShort = proof?.proof_hash
    ? `${proof.proof_hash.slice(0, 18)}...${proof.proof_hash.slice(-10)}`
    : '--';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>Proof Ledger</Text>
        <Text style={styles.subtitle}>
          {loading ? 'Loading proof ledger…' : sessionId ?? 'No session selected'}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Proof Record</Text>
        <View style={styles.recordHeader}>
          <View style={[styles.statusChip, proof?.sla_met ? styles.statusOk : styles.statusWarn]}>
            <Text style={styles.statusText}>{proof?.sla_met ? 'SLA MET' : 'SLA BREACH'}</Text>
          </View>
          <Text style={styles.modeText}>{proof?.proof_mode ?? 'pending'}</Text>
        </View>
        <Text style={styles.hashLabel}>Hash</Text>
        <Text style={styles.hashValue}>{proofHashShort}</Text>
        <Text style={styles.copyText}>
          Stored in Mongo today as the canonical session proof record.
        </Text>

        {proof?.anchor?.explorer_url ? (
          <Pressable onPress={() => Linking.openURL(proof.anchor!.explorer_url!)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>View Chain Anchor</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Session Summary</Text>
        <View style={styles.summaryGrid}>
          {summaryRows.map(([label, value]) => (
            <View key={label} style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={styles.summaryValue}>{String(value)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Ledger Trail</Text>
        {entries.length > 0 ? (
          <View style={styles.ledgerList}>
            {entries.map((entry, index) => (
              <View key={`${entry.action}-${entry.ts}-${index}`} style={styles.ledgerItem}>
                <View style={styles.ledgerDot} />
                <View style={styles.ledgerBody}>
                  <View style={styles.ledgerHeader}>
                    <Text style={styles.ledgerAction}>{entry.action}</Text>
                    <Text style={styles.ledgerTs}>{new Date(entry.ts).toLocaleString()}</Text>
                  </View>
                  <Text style={styles.ledgerMeta}>
                    verified {String(entry.verified ?? false)} · mode {entry.proof_mode ?? '--'}
                  </Text>
                  <Text style={styles.ledgerHash}>
                    {entry.proof_hash ? `${entry.proof_hash.slice(0, 16)}...${entry.proof_hash.slice(-8)}` : 'No hash'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No audit entries recorded for this session yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#0b1220',
    padding: 20,
    gap: 14,
  },
  hero: {
    gap: 4,
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
  },
  error: {
    color: '#fca5a5',
    fontWeight: '600',
  },
  panel: {
    backgroundColor: '#121c2f',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#243247',
    padding: 16,
    gap: 10,
  },
  sectionLabel: {
    color: '#7dd3fc',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusOk: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.28)',
  },
  statusWarn: {
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderColor: 'rgba(251,191,36,0.28)',
  },
  statusText: {
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '700',
  },
  modeText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  hashLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  hashValue: {
    color: '#f8fafc',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  copyText: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
  },
  primaryButton: {
    marginTop: 2,
    backgroundColor: '#38bdf8',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#082032',
    textAlign: 'center',
    fontWeight: '800',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCell: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  summaryLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  ledgerList: {
    gap: 10,
  },
  ledgerItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  ledgerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 7,
    backgroundColor: '#38bdf8',
  },
  ledgerBody: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  ledgerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  ledgerAction: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  ledgerTs: {
    color: '#94a3b8',
    fontSize: 11,
  },
  ledgerMeta: {
    color: '#cbd5e1',
    fontSize: 11,
  },
  ledgerHash: {
    color: '#7dd3fc',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 12,
  },
});
