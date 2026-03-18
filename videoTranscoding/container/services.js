import {S3Client , GetObjectCommand, PutObjectCommand} from "@aws-sdk/client-s3"
import os from "node:os"
import fetch from 'node-fetch'
import fs from "node:fs/promises"
import Ffmpeg from "fluent-ffmpeg"
import path from "node:path"
import { Buffer } from 'node:buffer'
import dotenv from "dotenv"

dotenv.config()

function createS3Client() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const hasStaticCreds = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

    if (hasStaticCreds) {
        return new S3Client({
            region,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
    }

    // Prefer AWS SDK default credential chain (env, IAM role, shared profile).
    return new S3Client({ region });
}

export const config = {
    s3Client : createS3Client(),
    honoEndpoint: process.env.PRODUCER_URL || "http://host.docker.internal:3001",
    bucket: process.env.S3_BUCKET || 'video-transcoding-mob.mobcloudx.xyz',
    key: process.env.S3_KEY || 'videos/video5.mp4',
    productionBucket: process.env.S3_PRODUCTION_BUCKET || 'prod-video.mobcloudx.xyz',
    taskArn: 'arn:aws:ecs:us-east-1:925401939418:task-definition/Task:3',
    containerName:'video-transcoding-container',
    resolutions:[
        { name: "480p", width: 854, height: 480 },
        { name: "720p", width: 1280, height: 720 },
        { name: "1080p", width: 1920, height: 1080 },
    ],
    progressInterval: 5000 
}

/*Emit transcoded STARTED EVENT */
export function now(){
    return Date.now();
}

export const getResourceUsage = () =>{
    const cpus = os.cpus()
    const totalMem = os.totalmem()
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
        cpu_percent: cpus.reduce((acc, cpu) => {
            const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
            const idle = cpu.times.idle;
            return acc + ((total - idle) / total) * 100;
        }, 0) / cpus.length,
        mem_mb: Math.round(usedMem / 1024 / 1024),
    }
}

export async function postEvent(endpoint, body) {
    try {
        const url = `${config.honoEndpoint}${endpoint}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const text = await response.text();
            console.warn(`Failed to post to ${endpoint}:`, response.status, text);
        } else {
            console.log(`✓ Posted to ${endpoint}`);
        }
    } catch (error) {
        console.error(`Error posting to ${endpoint}:`, error.message);
    }
}

export async function emitTranscodeStarted(sessionId, startTime) {
    await postEvent("/transcode-event", {
        videoKey: config.key,
        taskArn: config.taskArn,
        status: "STARTED",
        ts: startTime,
        meta: {
            container: config.containerName,
            sessionId
        }
    });
}

export async function emitTranscodeCompleted(sessionId, outputs, totalDuration) {
    await postEvent("/transcode-event", {
        videoKey: config.key,
        taskArn: config.taskArn,
        status: "COMPLETED",
        outputs,
        duration_ms: totalDuration,
        ts: now(),
        meta: {
            container: config.containerName,
            sessionId
        }
    });
}

export async function emitTranscodeFailed(sessionId, error, totalDuration) {
    await postEvent("/transcode-event", {
        videoKey: config.key,
        taskArn: config.taskArn,
        status: "FAILED",
        duration_ms: totalDuration,
        outputs: [],
        ts: now(),
        meta: {
            error: error.message,
            sessionId,
            container: config.containerName
        }
    });
}

export async function emitDownloadComplete(sessionId, downloadDuration, fileSizeMb) {
    await postEvent("/telemetry-service", {
        eventType: "download_complete",
        sessionId,
        ts: now(),
        metrics: {
            duration_ms: downloadDuration,
            file_size_mb: fileSizeMb,
            ...getResourceUsage()
        },
        meta: {
            taskArn: config.taskArn,
            videoKey: config.key
        }
    });
}
/*Emit Resolution telemetry at the start of the event */

export async function emitResolutionStart(sessionId, resolution, outputKey) {
    await postEvent("/telemetry-service", {
        eventType: "transcode_resolution_start",
        sessionId,
        ts: now(),
        metrics: {
            resolution: resolution.name,
            target_width: resolution.width,
            target_height: resolution.height,
            ...getResourceUsage()
        },
        meta: {
            taskArn: config.taskArn,
            videoKey: config.key,
            outputKey
        }
    });
}

export async function emitProgress(sessionId, resolution, progress, elapsedSec) {
    const usage =  getResourceUsage();
    await postEvent("/telemetry-service", {
        eventType: "progress",
        sessionId,
        ts: now(),
        metrics: {
            cpu_percent: usage.cpu_percent,
            mem_mb: usage.mem_mb,
            progress_percent: progress.percent || 0,
            elapsed_sec: elapsedSec,
            frames: progress.frames || 0,
            currentFps: progress.currentFps || 0
        },
        meta: {
            taskArn: config.taskArn,
            container: config.containerName,
            videoKey: config.key,
            resolution: resolution.name
        }
    });
}


export async function emitResolutionComplete(sessionId, resolution, outputKey, metrics) {
    await postEvent("/telemetry-service", {
        eventType: "transcode_resolution_complete",
        sessionId,
        ts: now(),
        metrics: {
            resolution: resolution.name,
            output_size_mb: metrics.outputSizeMb,
            transcode_duration_ms: metrics.transcodeDuration,
            upload_duration_ms: metrics.uploadDuration,
            total_duration_ms: metrics.totalDuration,
            ...getResourceUsage()
        },
        meta: {
            taskArn: config.taskArn,
            videoKey: config.key,
            outputKey
        }
    });
}

export async function emitVideoAnalysis(sessionId, analysis){
    await postEvent("/telemetry-service",{
        eventType:"video_analysis",
        sessionId,
        ts:now(),
        metrics:analysis,
        meta:{
            taskArn: config.taskArn,
            videoKey:config.key
        }
    })
}

export async function emitTaskComplete(sessionId, outputs, totalDuration) {
    await postEvent("/telemetry-service", {
        eventType: "transcode_task_complete",
        sessionId,
        ts: now(),
        metrics: {
            total_outputs: outputs.length,
            total_duration_ms: totalDuration,
            avg_duration_per_resolution_ms: Math.round(totalDuration / outputs.length),
            ...getResourceUsage()
        },
        meta: {
            taskArn: config.taskArn,
            videoKey: config.key,
            outputs: outputs.map(o => o.key)
        }
    });
}

export async function emitVMAFScore(sessionId, vmafResult) {
    if (vmafResult.vmaf_score < 0) {
        console.warn(`⚠️ VMAF score was ${vmafResult.vmaf_score} — skipping emit`);
        return;
    }
    await postEvent("/telemetry-service", {
        eventType: "vmaf_score",
        sessionId,
        ts: now(),
        metrics: {
            vmaf_score: vmafResult.vmaf_score,
            resolution: vmafResult.resolution,
            width: vmafResult.width,
            height: vmafResult.height,
            model: vmafResult.model || 'vmaf_v0.6.1'
        },
        meta: {
            taskArn: config.taskArn,
            videoKey: config.key,
            reference: vmafResult.reference,
            distorted: vmafResult.distorted
        }
    });
    // Also post to dedicated VMAF topic for consumer/dashboard
    await postEvent("/vmaf-score", {
        sessionId,
        vmaf_score: vmafResult.vmaf_score,
        resolution: vmafResult.resolution,
        width: vmafResult.width,
        height: vmafResult.height,
        model: vmafResult.model || 'vmaf_v0.6.1',
        ts: now()
    });
}