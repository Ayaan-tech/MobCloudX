"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityGroups = exports.subnets = exports.Resolutions = exports.s3Client = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
if (!process.env.Region || !process.env.AccessKey || !process.env.SecretAccessKey) {
    throw new Error("Missing required AWS environment variables: Region, AccessKey, and SecretAccessKey must be set.");
}
exports.s3Client = new client_s3_1.S3Client({
    region: process.env.Region,
    credentials: {
        accessKeyId: process.env.AccessKey,
        secretAccessKey: process.env.SecretAccessKey
    }
});
exports.Resolutions = [
    { name: "360p", width: 480, height: 360 },
    { name: "480p", width: 640, height: 480 },
    { name: "720p", width: 1280, height: 720 },
    { name: "1080p", width: 1920, height: 1080 },
];
exports.subnets = [
    'subnet-04dfae4243da82af8',
    'subnet-0330bd98b501500d5',
    'subnet-0bf1f14cdc56b3477',
    'subnet-0420c0c3ebb7f6784',
    'subnet-00b4d9acf67a65f33',
    'subnet-015ff5d13a55c4589'
];
exports.SecurityGroups = ['sg-0d27768c44f912785'];
