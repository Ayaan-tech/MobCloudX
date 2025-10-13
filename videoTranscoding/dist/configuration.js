"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.now = now;
const client_s3_1 = require("@aws-sdk/client-s3");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
if (!process.env.HONO_ENDPOINT || !process.env.BUCKET || !process.env.KEY || !process.env.ProductionBucketName || !process.env.TaskDefinition || !process.env.REGION) {
    throw new Error("Missing required environment variables: HONO_ENDPOINT, BUCKET, KEY, ProductionBucketName, TaskDefinition, REGION must be set.");
}
exports.config = {
    s3Client: new client_s3_1.S3Client({
        region: process.env.REGION,
        credentials: ({
            accessKeyId: process.env.AccessKey,
            secretAccessKey: process.env.SecretAccessKey
        })
    }),
    honoEndpoint: process.env.HONO_ENDPOINT || "http://localhost:3001",
    bucket: process.env.BUCKET,
    key: process.env.KEY,
    productionBucket: process.env.ProductionBucketName,
    taskArn: process.env.TaskDefinition,
    containerName: process.env.HOSTNAME,
    resolutions: [
        { name: "360p", width: 480, height: 360 },
        { name: "480p", width: 640, height: 480 },
        { name: "720p", width: 1280, height: 720 },
        { name: "1080p", width: 1920, height: 1080 },
    ],
    progressInterval: 5000
};
function now() {
    return Date.now();
}
