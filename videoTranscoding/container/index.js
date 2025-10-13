import {S3Client , GetObjectCommand, PutObjectCommand} from "@aws-sdk/client-s3"
import dotenv from 'dotenv'
import os from "node:os"
import fetch from 'node-fetch'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import fs from "node:fs/promises"
import Ffmpeg from "fluent-ffmpeg"

import { emitDownloadComplete, emitTaskComplete, emitTranscodeFailed, emitTranscodeCompleted, emitTranscodeStarted } from "./services.js"
import { downloadFromS3 } from "./s3.service.js"
import { analyzeVideoQuality, cleanup, transcodeResolution, transcodeToResolutions } from "./transcode.service.js"
dotenv.config()
export const config = {
    s3Client : new S3Client({
        region: 'us-east-1',
        credentials:({
            accessKeyId: 'AKIA5O5SA7XNOZPWCCMJ' ,
            secretAccessKey: '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', 
        })
    }),
    honoEndpoint:  "http://host.docker.internal:3001",
    bucket: 'video-transcoding-mob.mobcloudx.xyz',
    key: 'videos/video5.mp4',
    productionBucket: 'prod-video.mobcloudx.xyz',
    taskArn: 'arn:aws:ecs:us-east-1:925401939418:task-definition/Task:3',
    containerName: 'video-transcoding-container',
    resolutions:[

        { name: "720p", width: 1280, height: 720 },
 
    ],
    progressInterval: 5000 
}
export function now(){
    return Date.now();
}
export function logPipelineFailure(error) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ TRANSCODING FAILED");
    console.error("=".repeat(60));
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    console.error("=".repeat(60));
}
export function validateVideoQuality(analysis){
    const errors = []
    if(analysis.duration > 7200){
        errors.push(`Video too long: ${Math.round(analysis.duration / 60)} minutes (max 120 minutes)`);
    }
    //Check QOE Score
    if(analysis.estimatedQuality < 30){
        errors.push(`Video quality too low: score ${analysis.estimatedQuality}/100`);
    }
    return true;
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

export function validateEnvironment() {
    const required = ['bucket', 'key', 'productionBucket'] 
    const missing = required.filter(key => !config[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

export function generateSessionId() {
    const basename = path.basename(config.key, path.extname(config.key));
    return `transcode-${Date.now()}-${basename}`;
}

export function logPipelineStart() {
    console.log("=".repeat(60));
    console.log("🎬 Starting Video Transcoding Pipeline");
    console.log("=".repeat(60));
    console.log("Input:", `s3://${config.bucket}/${config.key}`);
    console.log("Output Bucket:", config.productionBucket);
    console.log("Hono Endpoint:", config.honoEndpoint);
    console.log("Resolutions:", config.resolutions.map(r => r.name).join(", "));
    console.log("=".repeat(60));
}

export function logPipelineSuccess(outputs, totalDuration) {
    console.log("\n" + "=".repeat(60));
    console.log("✅ TRANSCODING COMPLETED SUCCESSFULLY");
    console.log("=".repeat(60));
    console.log(`Total Duration: ${Math.round(totalDuration / 1000)}s`);
    console.log(`Outputs Generated: ${outputs.length}`);
    outputs.forEach(output => {
        console.log(`  - ${output.resolution}: ${output.key}`);
    });
    console.log("=".repeat(60));
}


async function runTranscodingPipeline(){
    validateEnvironment();
    const sessionId = generateSessionId();
    const startedAt = now();
    logPipelineStart()

    await emitTranscodeStarted(sessionId, startedAt)

    let downloadResult;
    try {
       downloadResult = await downloadFromS3();
       await emitDownloadComplete(
        sessionId,
        downloadResult.downloadDuration,
        Math.round(downloadResult.size / 1024 / 1024)
       );
       console.log("\n🔍 Analyzing video quality...");
       const analysis = await analyzeVideoQuality(downloadResult.path)
       console.log("Video Analysis:");
        console.log(`  Resolution: ${analysis.resolution}`);
        console.log(`  Duration: ${Math.round(analysis.duration)}s`);
        console.log(`  Bitrate: ${Math.round(analysis.bitrate / 1000000)}Mbps`);
        console.log(`  Codec: ${analysis.codec}`);
        console.log(`  Quality Score: ${analysis.estimatedQuality}/100`);

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
       validateVideoQuality(analysis)
       const outputs = await transcodeToResolutions(downloadResult.path, sessionId)
       const outputKeys = outputs.map(o => o.key)
       if(downloadResult.path) await cleanup(downloadResult.path)

       const finishedAt = now();
       const totalDuration = finishedAt - startedAt
       await emitTranscodeCompleted(sessionId, outputKeys, Number(totalDuration));
       await emitTaskComplete(sessionId, outputKeys, Number(totalDuration));

       logPipelineSuccess(outputs, totalDuration)

       return {success:true , outputs}
    } catch (error) {
        logPipelineFailure(error);
        await emitTranscodeFailed(sessionId, error, now() - startedAt);
        if(downloadResult?.path){
            console.log(`⚠️ Cleaning up temporary file due to failure: ${downloadResult.path}`);
            try {
                await cleanup(downloadResult.path)
            } catch (error) {
                console.error(`Failed to clean up temporary file: ${downloadResult.path}`, error);
            }
        } 
        throw error
    }
}

(async function main(){
    try {
        await runTranscodingPipeline();
        process.exit(0)
    } catch (error) {
        console.error(error)
        process.exit(1)
    }
})()