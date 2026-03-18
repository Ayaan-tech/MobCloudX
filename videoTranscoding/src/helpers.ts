import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs/promises";
import Ffmpeg from "fluent-ffmpeg";
import path from "node:path";

import os from "node:os";
import { config, IAnalysis, IOutput } from "./configuration";
import dotenv from "dotenv";


dotenv.config();
const { HONO_ENDPOINT } = process.env;
if (!HONO_ENDPOINT) {
    throw new Error("HONO_ENDPOINT is not defined in environment variables.");
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

export async function postEvent(endpoint:string, body: object) {
    try {
        const url = `${HONO_ENDPOINT}${endpoint}`;
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
    } catch (error: any) {
        console.error(`Error posting to ${endpoint}:`, error.message);
    }
}

export function validateEnvironment() {
    const required = ['bucket', 'key', 'productionBucket'] as const;
    const missing = required.filter(key => !config[key  as keyof typeof config]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

export function generateSessionId() {
    const basename = path.basename(config.key!, path.extname(config.key!));
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

export function logPipelineSuccess(outputs : IOutput[], totalDuration: number) {
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
export function logPipelineFailure(error:Error) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ TRANSCODING FAILED");
    console.error("=".repeat(60));
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    console.error("=".repeat(60));
}

export function calculateQualityScore(videoStream:{width: number, height: number, codec_name: string } , format:{ bit_rate: number }) {
    let score = 0;
    
    // Resolution score (0-40 points)
    const pixels = videoStream.width * videoStream.height;
    if (pixels >= 1920 * 1080) score += 40;
    else if (pixels >= 1280 * 720) score += 30;
    else if (pixels >= 640 * 480) score += 20;
    else score += 10;
    
    // Bitrate score (0-30 points)
    const bitrate = format.bit_rate / 1000000; // Convert to Mbps
    if (bitrate >= 8) score += 30;
    else if (bitrate >= 4) score += 20;
    else if (bitrate >= 2) score += 10;
    else score += 5;
    
    // Codec score (0-30 points)
    if (videoStream.codec_name === 'h264' || videoStream.codec_name === 'hevc') {
        score += 30;
    } else if (videoStream.codec_name === 'vp9') {
        score += 25;
    } else {
        score += 15;
    }
    
    return score; // Max 100
}

export function validateVideoQuality(analysis: IAnalysis): boolean {
    const errors: string[] = []
    if(analysis.duration > 7200){
        errors.push(`Video too long: ${Math.round(analysis.duration / 60)} minutes (max 120 minutes)`);
    }
    //Check QOE Score
    if(analysis.estimatedQuality < 30){
        errors.push(`Video quality too low: score ${analysis.estimatedQuality}/100`);
    }
    if (errors.length > 0) {
        console.warn('Video quality validation failed:', errors.join('; '));
    }
    return errors.length === 0;
}

