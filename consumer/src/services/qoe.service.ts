import type { QoeScore, TelemetryMetrics, TranscodeEvent } from "../types.js";
import {calculateCPUEfficiencyScore , calculateTranscodingSpeedScore,stabilityScore,getQoeCategory, calculateMemoryEfficiencyScore, calculateOutputQualityScore } from '../helpers.js'

export class QoeCalculator{
    private sessionMetrics: Map<string, TelemetryMetrics[]> = new Map();
    private sessionTranscodeInfo : Map<string , TranscodeEvent> = new Map();
    addTelemetry(sessionId: string, metrics: TelemetryMetrics){
        if(!this.sessionMetrics.has(sessionId)){
            this.sessionMetrics.set(sessionId, []);
        }
        this.sessionMetrics.get(sessionId)!.push(metrics);
    }
    addTranscodeEvent(sessionId: string, event: TranscodeEvent){
        this.sessionTranscodeInfo.set(sessionId,event);
    }
    calculateQoe(sessionId: string): QoeScore | null{
        const metrics = this.sessionMetrics.get(sessionId);
        const transcodeInfo = this.sessionTranscodeInfo.get(sessionId);
        console.log(`Calculating QoE for session ${sessionId} with ${metrics?.length || 0} metrics and transcode info:`, transcodeInfo);
        if(!metrics || metrics.length === 0) {
            console.warn('No metrics available for QoE calculation');
            return null;
        }
        if(!transcodeInfo){
            console.warn('No transcode info available for QoE calculation');
            return null
        }

        const videoAnalysisMetric = metrics?.find(m=>m.eventType === 'video_analysis');
        if(!videoAnalysisMetric){
            console.warn('No video analysis metric found for QoE calculation');
            return null;
        }
        const playbackMetric = (videoAnalysisMetric?.duration || 0) *1000; // convert to ms
        console.log('Video playback duration (ms):', playbackMetric);
        if(playbackMetric === 0){
            console.warn('Invalid playback duration for QoE calculation');
            return null
        }
        if(transcodeInfo && playbackMetric >0){
            transcodeInfo.duration_ms = playbackMetric;
        }
        const pipelineDuration = transcodeInfo?.duration_ms || 0;

        if(!metrics || metrics.length === 0) return null;
        const speedScores  = calculateTranscodingSpeedScore(metrics, transcodeInfo, playbackMetric)
        const cpuEfficiencyScores = calculateCPUEfficiencyScore(metrics)
        const outputQualityScores = calculateOutputQualityScore(metrics, transcodeInfo)
        const stabilityScores = stabilityScore(metrics)

        const weights = {
            transcoding_speed : 0.25,
            cpu_efficiency: 0.25,
            memory_efficiency: 0.15,
            output_quality: 0.25,
            stability: 0.15
        }
        const qoeScore = speedScores*weights.transcoding_speed + 
        cpuEfficiencyScores*weights.cpu_efficiency + outputQualityScores*weights.output_quality + 
        stabilityScores*weights.stability;
        const cpuValues = metrics.map(m => m.cpu_percent).filter((v): v is number => typeof v === 'number') as number[];
        const memValues = metrics.map(m => m.memory_percent).filter((v): v is number => typeof v === 'number') as number[];
        const avgCpu = cpuValues.length > 0 ? cpuValues.reduce((a,b) => a+b,0)/cpuValues.length : 0;
        const maxCpu = Math.max(...cpuValues);
        const avgMemory = memValues.length > 0 ? memValues.reduce((a,b) => a+b,0)/memValues.length : 0;

        const qoeResult:QoeScore = {
            sessionId,
            qoe:Math.round(qoeScore*100)/100,
            ts: Date.now(),
            details:{
                transcoding_speed_score: Math.round(speedScores*100)/100,
                cpu_efficiency_score: Math.round(cpuEfficiencyScores*100)/100,
                memory_efficiency_score: Math.round(avgMemory*100)/100,
                output_quality_score: Math.round(outputQualityScores*100)/100,
                stability_score: Math.round(stabilityScores*100)/100,
                avg_cpu_percent: Math.round(avgCpu*100)/100,
                max_cpu_percent: Math.round(maxCpu*100)/100,
                total_duration_ms: transcodeInfo.duration_ms,
                output_count: transcodeInfo.outputs?.length || 0,
                calculation_method :"rule_based_v1"
            }
        }
        return qoeResult;
    }
    }
export default new QoeCalculator();