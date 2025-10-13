import type { TelemetryMetrics, TranscodeEvent } from "./types.js"

export function calculateTranscodingSpeedScore(metrics: TelemetryMetrics[] , transcodeInfo: TranscodeEvent, videoPlaybackMetric:number): number{
    const pipelineDuration = transcodeInfo.duration_ms || 0;
    const videoDuration = videoPlaybackMetric || 0;
    if (pipelineDuration === 0 || videoDuration === 0) {
        return 0;
    }

    const speed = videoDuration / pipelineDuration; // 1x means real-time

    if(speed >= 0.5 && speed <= 1.2) return 100;
    else if(speed < 0.5) return 80
    else if(speed <=1.5) return 75;
    else if (speed<= 2.0) return 50;
    else return 25;

    
}
let messageStats = {
    telemetry: 0,
    transcode: 0,
    qoe: 0,
    qoe_calculated: 0,
    errors: 0
};

export function calculateOutputQualityScore(metrics: TelemetryMetrics[], transcodeInfo: TranscodeEvent): number{
    const outputCount = transcodeInfo.outputs?.length || 0;
    const expectedOutputs = 4; // Assume we expect at least 3 outputs for good quality
    if(outputCount >= expectedOutputs) return 100;
    else if(outputCount >= expectedOutputs *0.75) return 75;
    else if(outputCount >= expectedOutputs *0.5) return 50;
    else return 25;
}

export function calculateMemoryEfficiencyScore(metrics: TelemetryMetrics[]):number{
    const memValues = metrics.map(m => m.mem_mb).filter((v): v is number => typeof v === 'number') as number[];
    if (memValues.length === 0) return 0;
    const avgMem = memValues.reduce((a, b) => a + b, 0) / memValues.length;
    const maxMem = Math.max(...memValues);
    //Check for memory spikes
    const memGrowth = maxMem / avgMem;
    if (memGrowth <= 1.3) {
        return 100;
    }else if(memGrowth <= 1.5){
        return 85;
    }else if(memGrowth <= 1.8){
        return 70;
    }else if(memGrowth <= 2.0){
        return 50;
    }else{
        return 30;
    }
}
export function calculateCPUEfficiencyScore(metrics:TelemetryMetrics[]):number{
    const cpuValues = metrics.map(m => m.cpu_percent).filter((v): v is number => typeof v === 'number') as number[];
      if (cpuValues.length === 0) return 0;
      const avgCpu = cpuValues.length > 0 ? cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length : 0;
              if (avgCpu >= 40 && avgCpu <= 70) {
            return 100;
        } else if (avgCpu >= 30 && avgCpu < 40) {
            return 80;
        } else if (avgCpu > 70 && avgCpu <= 80) {
            return 75;
        } else if (avgCpu > 80 && avgCpu <= 90) {
            return 60;
        } else if (avgCpu < 30 || avgCpu > 90) {
            return 40;
        }
        
        return 50;
}

export function stabilityScore(metrics: TelemetryMetrics[]): number{
    const cpuValues = metrics.map(m => m.cpu_percent).filter((v): v is number => typeof v === 'number') as number[];
    if (cpuValues.length === 0) return 0;
    const stdDev = Math.sqrt(cpuValues.map(v => (v - (cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length)) ** 2).reduce((a, b) => a + b, 0) / cpuValues.length);
    if (stdDev <= 10) {
        return 100;
    } else if (stdDev <= 20) {
        return 80;
    } else if (stdDev <= 30) {
        return 60;
    } else {
        return 40;
    }
}

export function getQoeCategory(qoe: number): string{
    if(qoe >= 85) return 'Excellent';
    else if(qoe >= 70) return 'Good';
    else if(qoe >= 50) return 'Fair';
    else return 'Poor';
}

export function startStatsLogger() {
    setInterval(() => {
        const total = messageStats.telemetry + messageStats.transcode + messageStats.qoe
        if (total > 0) {
            console.log('\n' + '='.repeat(60))
            console.log('📈 Consumer Statistics')
            console.log('='.repeat(60))
            console.log(`Telemetry:      ${messageStats.telemetry} messages`)
            console.log(`Transcode:      ${messageStats.transcode} messages`)
            console.log(`QoE Received:   ${messageStats.qoe} messages`)
            console.log(`QoE Calculated: ${messageStats.qoe_calculated} scores`)
            console.log(`Errors:         ${messageStats.errors}`)
            console.log(`Total:          ${total} messages processed`)
            console.log('='.repeat(60) + '\n')
        }
    }, 60000); // Log every minute
}