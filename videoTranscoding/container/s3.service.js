import {S3Client , GetObjectCommand, PutObjectCommand} from "@aws-sdk/client-s3"
import os from "node:os"
import fetch from 'node-fetch'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import fs from "node:fs/promises"
import Ffmpeg from "fluent-ffmpeg"
import dotenv from "dotenv"


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


export async function downloadFromS3(){
    const downloadStart = now();
    const command = new GetObjectCommand({
        Bucket:config.bucket,
        Key:config.key
    })
    const result = await config.s3Client.send(command)
    if(!result.Body) throw new Error('S3 Download Failed: result.Body is missing from GetObjectCommand response.');
    const readableStream = result.Body;
    const outputPath = `original-${now()}.mp4`

    //Streams to chunk for efficient loading in S3 i.e Parallel Processing 
    const chunks = []
    for await(const chunk of readableStream){
        chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks);
    await fs.writeFile(outputPath, buffer);
    
    const stats = await fs.stat(outputPath);
    const downloadDuration = now() - downloadStart;

    console.log(`✓ Downloaded to: ${outputPath}`);
    console.log(`  Size: ${Math.round(stats.size / 1024 / 1024)} MB`);
    console.log(`  Duration: ${Math.round(downloadDuration / 1000)}s`);

    return {
        path:path.resolve(outputPath),
        size:stats.size,
        downloadDuration
    }

}

export async function uploadToS3(localPath, s3Key){
    const fileData = await fs.readFile(localPath);
    
    const command = new PutObjectCommand({
        Bucket: config.productionBucket,
        Key: s3Key,
        Body: fileData
    });
    
    await config.s3Client.send(command);
    
    return {
        size: fileData.length,
        key: s3Key
    };
}


