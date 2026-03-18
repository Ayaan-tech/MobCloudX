import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from 'dotenv'
dotenv.config()
if(!process.env.HONO_ENDPOINT || !process.env.BUCKET || !process.env.KEY || !process.env.ProductionBucketName || !process.env.TaskDefinition || !process.env.Region || !process.env.AccessKey || !process.env.SecretAccessKey){
    throw new Error("Missing required environment variables: HONO_ENDPOINT, BUCKET, KEY, ProductionBucketName, TaskDefinition, Region, AccessKey, SecretAccessKey must be set.")
}

export const config = {
    s3Client : new S3Client({
        region: process.env.Region!,
        credentials:({
            accessKeyId:process.env.AccessKey! ,
            secretAccessKey:process.env.SecretAccessKey!
        })
    }),
    honoEndpoint: process.env.HONO_ENDPOINT || "http://localhost:3001",
    bucket:process.env.BUCKET,
    key:process.env.KEY,
    productionBucket: process.env.ProductionBucketName,
    taskArn: process.env.TaskDefinition,
    containerName:process.env.HOSTNAME,
    resolutions:[
        { name: "360p", width: 480, height: 360 },
        { name: "480p", width: 640, height: 480 },
        { name: "720p", width: 1280, height: 720 },
        { name: "1080p", width: 1920, height: 1080 },
    ],
    progressInterval: 5000 
}

export interface IResolution {
    name: string;
    width: number;
    height: number;
    
}

export interface IOutput{
    resolution: string;
    key: string;
}

export interface IAnalysis {
    duration: number;
    estimatedQuality: number;
}

export function now(){
    return Date.now();
}