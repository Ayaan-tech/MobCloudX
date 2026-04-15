import { calculateCPUEfficiencyScore, calculateTranscodingSpeedScore, stabilityScore, getQoeCategory, calculateMemoryEfficiencyScore, calculateOutputQualityScore } from '../helpers.js';
function calculateAudioQualityScore(metrics) {
    const audioMetrics = metrics.filter((m) => typeof m.audio_jitter_ms === 'number' ||
        typeof m.audio_packet_loss_pct === 'number' ||
        typeof m.av_sync_offset_ms === 'number');
    if (audioMetrics.length === 0)
        return 70;
    let score = 100;
    for (const m of audioMetrics) {
        const jitter = m.audio_jitter_ms ?? 0;
        const loss = m.audio_packet_loss_pct ?? 0;
        const avSync = Math.abs(m.av_sync_offset_ms ?? 0);
        if (jitter > 80)
            score -= 8;
        else if (jitter > 40)
            score -= 4;
        if (loss > 3)
            score -= 10;
        else if (loss > 1)
            score -= 5;
        if (avSync > 120)
            score -= 6;
    }
    return Math.max(0, Math.min(100, Math.round(score / audioMetrics.length)));
}
export class QoeCalculator {
    sessionMetrics = new Map();
    sessionTranscodeInfo = new Map();
    sessionVMAFScores = new Map();
    addTelemetry(sessionId, metrics) {
        if (!this.sessionMetrics.has(sessionId)) {
            this.sessionMetrics.set(sessionId, []);
        }
        this.sessionMetrics.get(sessionId).push(metrics);
    }
    addTranscodeEvent(sessionId, event) {
        this.sessionTranscodeInfo.set(sessionId, event);
    }
    addVMAFScore(sessionId, score, resolution) {
        if (!this.sessionVMAFScores.has(sessionId)) {
            this.sessionVMAFScores.set(sessionId, []);
        }
        this.sessionVMAFScores.get(sessionId).push({ score, resolution });
    }
    calculateQoe(sessionId) {
        const metrics = this.sessionMetrics.get(sessionId);
        const transcodeInfo = this.sessionTranscodeInfo.get(sessionId);
        console.log(`Calculating QoE for session ${sessionId} with ${metrics?.length || 0} metrics and transcode info:`, transcodeInfo);
        if (!metrics || metrics.length === 0) {
            console.warn('No metrics available for QoE calculation');
            return null;
        }
        if (!transcodeInfo) {
            console.warn('No transcode info available for QoE calculation');
            return null;
        }
        const videoAnalysisMetric = metrics?.find(m => m.eventType === 'video_analysis');
        if (!videoAnalysisMetric) {
            console.warn('No video analysis metric found for QoE calculation');
            return null;
        }
        const playbackMetric = (videoAnalysisMetric?.duration || 0) * 1000; // convert to ms
        console.log('Video playback duration (ms):', playbackMetric);
        if (playbackMetric === 0) {
            console.warn('Invalid playback duration for QoE calculation');
            return null;
        }
        if (transcodeInfo && playbackMetric > 0) {
            transcodeInfo.duration_ms = playbackMetric;
        }
        const pipelineDuration = transcodeInfo?.duration_ms || 0;
        if (!metrics || metrics.length === 0)
            return null;
        const speedScores = calculateTranscodingSpeedScore(metrics, transcodeInfo, playbackMetric);
        const cpuEfficiencyScores = calculateCPUEfficiencyScore(metrics);
        const memoryEfficiencyScores = calculateMemoryEfficiencyScore(metrics);
        const outputQualityScores = calculateOutputQualityScore(metrics, transcodeInfo);
        const stabilityScores = stabilityScore(metrics);
        const audioQualityScore = calculateAudioQualityScore(metrics);
        const weights = {
            transcoding_speed: 0.15,
            cpu_efficiency: 0.15,
            memory_efficiency: 0.10,
            output_quality: 0.15,
            stability: 0.10,
            audio_quality: 0.10,
            vmaf: 0.25 // VMAF gets highest weight — actual perceptual quality
        };
        // Get VMAF scores for this session
        const vmafScores = this.sessionVMAFScores.get(sessionId) || [];
        const avgVMAF = vmafScores.length > 0
            ? vmafScores.reduce((sum, v) => sum + v.score, 0) / vmafScores.length
            : -1;
        // Normalize VMAF to 0-100 scale (it's already 0-100)
        const vmafNormalized = avgVMAF >= 0 ? avgVMAF : 50; // Default to 50 if no VMAF
        const hasVMAF = avgVMAF >= 0;
        // If no VMAF available, redistribute weight to other metrics
        const effectiveWeights = hasVMAF ? weights : {
            transcoding_speed: 0.25,
            cpu_efficiency: 0.25,
            memory_efficiency: 0.15,
            output_quality: 0.25,
            stability: 0.15,
            audio_quality: 0.10,
            vmaf: 0
        };
        const qoeScore = speedScores * effectiveWeights.transcoding_speed +
            cpuEfficiencyScores * effectiveWeights.cpu_efficiency +
            memoryEfficiencyScores * effectiveWeights.memory_efficiency +
            outputQualityScores * effectiveWeights.output_quality +
            stabilityScores * effectiveWeights.stability +
            audioQualityScore * effectiveWeights.audio_quality +
            vmafNormalized * effectiveWeights.vmaf;
        const cpuValues = metrics.map(m => m.cpu_percent).filter((v) => typeof v === 'number');
        const memValues = metrics.map(m => m.mem_mb).filter((v) => typeof v === 'number');
        const avgCpu = cpuValues.length > 0 ? cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length : 0;
        const maxCpu = Math.max(...cpuValues);
        const avgMemory = memValues.length > 0 ? memValues.reduce((a, b) => a + b, 0) / memValues.length : 0;
        const qoeResult = {
            sessionId,
            qoe: Math.round(qoeScore * 100) / 100,
            ts: Date.now(),
            details: {
                transcoding_speed_score: Math.round(speedScores * 100) / 100,
                cpu_efficiency_score: Math.round(cpuEfficiencyScores * 100) / 100,
                memory_efficiency_score: Math.round(memoryEfficiencyScores * 100) / 100,
                output_quality_score: Math.round(outputQualityScores * 100) / 100,
                stability_score: Math.round(stabilityScores * 100) / 100,
                audio_quality_score: Math.round(audioQualityScore * 100) / 100,
                vmaf_score: hasVMAF ? Math.round(avgVMAF * 100) / 100 : null,
                vmaf_scores_by_resolution: vmafScores.length > 0 ? vmafScores : null,
                vmaf_included_in_qoe: hasVMAF,
                avg_cpu_percent: Math.round(avgCpu * 100) / 100,
                max_cpu_percent: Math.round(maxCpu * 100) / 100,
                total_duration_ms: transcodeInfo.duration_ms,
                output_count: transcodeInfo.outputs?.length || 0,
                calculation_method: hasVMAF ? "vmaf_weighted_v2" : "rule_based_v1"
            }
        };
        return qoeResult;
    }
}
export default new QoeCalculator();
