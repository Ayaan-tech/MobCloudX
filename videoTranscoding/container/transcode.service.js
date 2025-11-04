import {S3Client , GetObjectCommand, PutObjectCommand} from "@aws-sdk/client-s3"
import dotenv from 'dotenv'
import os from "node:os"
import { Buffer } from 'node:buffer'
import fs from "node:fs/promises"
import Ffmpeg from "fluent-ffmpeg"
import { emitProgress } from "./services.js"
import {emitResolutionComplete, emitResolutionStart} from './services.js'
import path, { resolve } from "node:path"



import { uploadToS3 } from "./s3.service.js"
dotenv.config()
export const config = {
    s3Client : new S3Client({
        region: 'us-east-1',
        credentials:({
             accessKeyId:process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY,
        })
    }),
    honoEndpoint: "http://host.docker.internal:3001",
    bucket:'video-transcoding-mob.mobcloudx.xyz',
    key:'videos/video5.mp4',
    productionBucket: 'prod-video.mobcloudx.xyz',
    taskArn: 'arn:aws:ecs:us-east-1:925401939418:task-definition/Task:3',
    containerName:'video-transcoding-container',
    resolutions:[
    
        { name: "720p", width: 1280, height: 720 },
     
    ],
    progressInterval: 5000 
}
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

export async function transcodeResolution(inputPath, resolution, sessionId){
    return new Promise((resolve, reject)=>{
        const resolutionStartTime = now();
        const outputPath = `video-${resolution.name}.mp4`;
        const s3Key = `${path.basename(config.key, path.extname(config.key))}-${resolution.name}.mp4`;
        
        let lastProgressTime = now();

        console.log(`\n${"=".repeat(60)}`);
        console.log(`🎞️  Transcoding: ${resolution.name} (${resolution.width}x${resolution.height})`);
        console.log(`${"=".repeat(60)}`);
        emitResolutionStart(sessionId, resolution, s3Key)
        Ffmpeg(inputPath)
        .output(outputPath)
        .withVideoCodec("libx264")
        .withAudioCodec("aac")
        .withSize(`${resolution.width}x${resolution.height}`)
        .on('start', (cmd) => {
                console.log(`[${resolution.name}] Started`);
        })
        .on('progress', async(progress)=>{
            const currentTime = now()
            if (currentTime - lastProgressTime >= config.progressInterval) {
                lastProgressTime = currentTime;
                const elapsed = Math.floor((currentTime - resolutionStartTime) / 1000);
                
                console.log(`[${resolution.name}] Progress: ${Math.round(progress.percent || 0)}%`);
                
                await emitProgress(sessionId, resolution, progress, elapsed);
            }
        })
        .on('end',async()=>{
            try {
                console.log(`[${resolution.name}] ✓ Transcoding completed. Uploading...`);
                const uploadStart = now()
                const uploadResult = await uploadToS3(outputPath, s3Key)
                const uploadDuration = now() - uploadStart;
                const totalDuration = now() - resolutionStartTime

                console.log(`[${resolution.name}] ✓ Uploaded to s3://${config.productionBucket}/${s3Key}`);
                console.log(`[${resolution.name}]   Size: ${Math.round(uploadResult.size / 1024 / 1024)} MB`);
                console.log(`[${resolution.name}]   Total Time: ${Math.round(totalDuration / 1000)}s`);

                await emitResolutionComplete(sessionId, resolution , s3Key, {
                    outputSizeMb:Math.round(uploadResult.size / 1024 / 1024),
                    transcodeDuration:totalDuration - uploadDuration,
                    uploadDuration,
                    totalDuration
                })

                await fs.unlink(outputPath).catch(()=>{})
                resolve({
                    key:s3Key,
                    size:uploadResult.size,
                    resolution:resolution.name,
                    duration_ms:totalDuration
                })
                
            } catch (error) {
                console.error(error)
                reject(error)
            }
        })
        .on('error', (err)=>{
            console.error(`[${resolution.name}] FFmpeg error:`, err);
            reject(err)
        })
        .format("mp4")
        .run()
    })

}

export async function transcodeToResolutions(inputPath, sessionId){
    const promises = config.resolutions.map(resolution => transcodeResolution(inputPath, resolution,sessionId))
    return Promise.all(promises)
}

/*Video Quality Analysis */

export async function analyzeVideoQuality(inputPath){
    return new Promise((resolve,reject)=>{
        Ffmpeg.ffprobe(inputPath, (err, metadata)=>{
            if (err) return reject(err);
            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
            if(!videoStream) return reject(new Error('No video stream found'))
            if(!audioStream) return reject(new Error('No audio stream found'))
            let fps = 30;
            if(videoStream.r_frame_rate && videoStream.r_frame_rate.includes('/')) {
                const [numerator , denominator] = videoStream.r_frame_rate.split('/').map(Number);
                if(denominator > 0) fps = numerator / denominator;
                
            }else if(!isNaN(videoStream.r_frame_rate)){
                    fps = Number(videoStream.r_frame_rate);
                }
            resolve({
                duration: metadata.format.duration,
                bitrate: metadata.format.bit_rate,
                size: parseInt(metadata.format.size),
                format:metadata.format.format_name,
                codec: metadata.streams[0].codec_name,
                width: videoStream.width,
                height:videoStream.height,
                fps:fps,
                estimateQuality:calculateQualityScore(videoStream, metadata.format),
                aspectRatio: `${videoStream.display_aspect_ratio || 'N/A'}`,
                pixelFormat: videoStream.pix_fmt,
                resolution:`${videoStream.width}x${videoStream.height}`,
                average_frames:videoStream.avg_frame_rate,
                estimateQuality:calculateQualityScore(videoStream, metadata.format),
                resolution:`${videoStream.width}x${videoStream.height}`,
                hasAudio: !!audioStream,
                audioCodec: audioStream?.codec_name || 'none', audioSampleRate: audioStream?.sample_rate || 0,
            });
        })
    })
}

export async function selectOptimalBitrate(inputPath, targetResolution) {
    const quality = await analyzeVideoQuality(inputPath);
    return Math.min(quality.bitrate, targetResolution.maxBitrate);
}

export async function cleanup(filePath) {
    try {
        await fs.unlink(filePath);
        console.log(`✓ Cleaned up: ${filePath}`);
    } catch (error) {
        console.warn(`⚠️  Could not cleanup ${filePath}:`, error.message);
    }
}
export function calculateQualityScore(videoStream, format) {
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