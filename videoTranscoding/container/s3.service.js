import {S3Client , GetObjectCommand, PutObjectCommand} from "@aws-sdk/client-s3"
import os from "node:os"
import fetch from 'node-fetch'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import fs from "node:fs/promises"
import Ffmpeg from "fluent-ffmpeg"
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

    return new S3Client({ region });
}

export const config = {
    s3Client : createS3Client(),
    honoEndpoint: "http://host.docker.internal:3001",
    bucket:'video-transcoding-mob.mobcloudx.xyz',
    key: process.env.S3_KEY || 'videos/input.mp4',
    productionBucket: process.env.S3_PRODUCTION_BUCKET || 'prod-video.mobcloudx.xyz',
    taskArn: 'arn:aws:ecs:us-east-1:925401939418:task-definition/Task:3',
    containerName:'video-transcoding-container',
    resolutions:[
        { name: "360p", width: 640, height: 360 },
        { name: "480p", width: 854, height: 480 },
        { name: "720p", width: 1280, height: 720 },
        { name: "1080p", width: 1920, height: 1080 },
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


export async function downloadFromS3(){
    const downloadStart = now();
    const command = new GetObjectCommand({
        Bucket:config.bucket,
        Key:config.key
    })
    
    console.log(`📥 Downloading from S3...`);
    console.log(`   Bucket: ${config.bucket}`);
    console.log(`   Key: ${config.key}`);
    
    const result = await config.s3Client.send(command)
    if(!result.Body) throw new Error('S3 Download Failed: result.Body is missing from GetObjectCommand response.');
    
    const readableStream = result.Body;
    const outputPath = `/app/original-${now()}.mp4`

    //Streams to chunk for efficient loading in S3 i.e Parallel Processing 
    const chunks = []
    for await(const chunk of readableStream){
        chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks);
    
    console.log(`   Buffer size: ${buffer.length} bytes`);
    
    await fs.writeFile(outputPath, buffer);
    
    const stats = await fs.stat(outputPath);
    const downloadDuration = now() - downloadStart;

    console.log(`✓ Downloaded to: ${outputPath}`);
    console.log(`  Size: ${Math.round(stats.size / 1024 / 1024)} MB`);
    console.log(`  Duration: ${Math.round(downloadDuration / 1000)}s`);
    
    // Verify the file is a valid video by checking magic bytes
    const fileBuffer = await fs.readFile(outputPath);
    const magicBytes = fileBuffer.slice(0, 12).toString('hex');
    console.log(`  Magic bytes: ${magicBytes}`);
    
    // Check for common video file signatures
    const isValidVideo = 
        magicBytes.startsWith('000000') && (magicBytes.includes('66747970') || magicBytes.includes('6d646174')) || // MP4
        magicBytes.startsWith('1a45dfa3') || // MKV
        magicBytes.startsWith('52494646'); // AVI
    
    if (!isValidVideo) {
        console.warn(`⚠️  Warning: Downloaded file may not be a valid video file`);
        console.warn(`   Expected MP4 signature (starts with 000000...ftyp), got: ${magicBytes}`);
    }

    return {
        path:outputPath,
        size:stats.size,
        downloadDuration
    }

}

export async function uploadToS3(localPath, s3Key){
    const fileData = await fs.readFile(localPath);

    await uploadBufferToS3(fileData, s3Key, 'video/mp4');

    return {
        size: fileData.length,
        key: s3Key
    };
}

export async function uploadBufferToS3(body, s3Key, contentType) {
    const command = new PutObjectCommand({
        Bucket: config.productionBucket,
        Key: s3Key,
        Body: body,
        ContentType: contentType,
    });

    await config.s3Client.send(command);
}

export async function uploadTextToS3(text, s3Key, contentType = 'text/plain') {
    await uploadBufferToS3(Buffer.from(text, 'utf8'), s3Key, contentType);
}


