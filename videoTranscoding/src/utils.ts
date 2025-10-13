import {S3Client , GetObjectCommand, PutObjectCommand, S3ClientConfig} from "@aws-sdk/client-s3"
import dotenv from 'dotenv'
dotenv.config()
if(!process.env.Region || !process.env.AccessKey || !process.env.SecretAccessKey){
    throw new Error("Missing required AWS environment variables: Region, AccessKey, and SecretAccessKey must be set.")
}

export const s3Client = new S3Client({
    region: process.env.Region,
    credentials:{
        accessKeyId: process.env.AccessKey,
        secretAccessKey: process.env.SecretAccessKey
    }
} as S3ClientConfig)


export const Resolutions = [
    {name: "360p", width:480, height : 360},
    {name: "480p", width:640, height : 480},
    {name: "720p", width:1280, height : 720},
    {name: "1080p", width:1920, height : 1080},
]
export const subnets = [
    'subnet-04dfae4243da82af8',
    'subnet-0330bd98b501500d5',
    'subnet-0bf1f14cdc56b3477',
    'subnet-0420c0c3ebb7f6784',
    'subnet-00b4d9acf67a65f33',
    'subnet-015ff5d13a55c4589'
]
export const SecurityGroups:string[] = ['sg-0d27768c44f912785']
