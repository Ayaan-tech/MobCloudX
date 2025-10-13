"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResourceUsage = void 0;
exports.postEvent = postEvent;
exports.validateEnvironment = validateEnvironment;
exports.generateSessionId = generateSessionId;
exports.logPipelineStart = logPipelineStart;
exports.logPipelineSuccess = logPipelineSuccess;
exports.logPipelineFailure = logPipelineFailure;
exports.calculateQualityScore = calculateQualityScore;
exports.validateVideoQuality = validateVideoQuality;
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const configuration_1 = require("./configuration");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const { HONO_ENDPOINT } = process.env;
if (!HONO_ENDPOINT) {
    throw new Error("HONO_ENDPOINT is not defined in environment variables.");
}
const getResourceUsage = () => {
    const cpus = node_os_1.default.cpus();
    const totalMem = node_os_1.default.totalmem();
    const freeMem = node_os_1.default.freemem();
    const usedMem = totalMem - freeMem;
    return {
        cpu_percent: cpus.reduce((acc, cpu) => {
            const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
            const idle = cpu.times.idle;
            return acc + ((total - idle) / total) * 100;
        }, 0) / cpus.length,
        mem_mb: Math.round(usedMem / 1024 / 1024),
    };
};
exports.getResourceUsage = getResourceUsage;
function postEvent(endpoint, body) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const url = `${HONO_ENDPOINT}${endpoint}`;
            const response = yield fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const text = yield response.text();
                console.warn(`Failed to post to ${endpoint}:`, response.status, text);
            }
            else {
                console.log(`✓ Posted to ${endpoint}`);
            }
        }
        catch (error) {
            console.error(`Error posting to ${endpoint}:`, error.message);
        }
    });
}
function validateEnvironment() {
    const required = ['bucket', 'key', 'productionBucket'];
    const missing = required.filter(key => !configuration_1.config[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}
function generateSessionId() {
    const basename = node_path_1.default.basename(configuration_1.config.key, node_path_1.default.extname(configuration_1.config.key));
    return `transcode-${Date.now()}-${basename}`;
}
function logPipelineStart() {
    console.log("=".repeat(60));
    console.log("🎬 Starting Video Transcoding Pipeline");
    console.log("=".repeat(60));
    console.log("Input:", `s3://${configuration_1.config.bucket}/${configuration_1.config.key}`);
    console.log("Output Bucket:", configuration_1.config.productionBucket);
    console.log("Hono Endpoint:", configuration_1.config.honoEndpoint);
    console.log("Resolutions:", configuration_1.config.resolutions.map(r => r.name).join(", "));
    console.log("=".repeat(60));
}
function logPipelineSuccess(outputs, totalDuration) {
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
function logPipelineFailure(error) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ TRANSCODING FAILED");
    console.error("=".repeat(60));
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    console.error("=".repeat(60));
}
function calculateQualityScore(videoStream, format) {
    let score = 0;
    // Resolution score (0-40 points)
    const pixels = videoStream.width * videoStream.height;
    if (pixels >= 1920 * 1080)
        score += 40;
    else if (pixels >= 1280 * 720)
        score += 30;
    else if (pixels >= 640 * 480)
        score += 20;
    else
        score += 10;
    // Bitrate score (0-30 points)
    const bitrate = format.bit_rate / 1000000; // Convert to Mbps
    if (bitrate >= 8)
        score += 30;
    else if (bitrate >= 4)
        score += 20;
    else if (bitrate >= 2)
        score += 10;
    else
        score += 5;
    // Codec score (0-30 points)
    if (videoStream.codec_name === 'h264' || videoStream.codec_name === 'hevc') {
        score += 30;
    }
    else if (videoStream.codec_name === 'vp9') {
        score += 25;
    }
    else {
        score += 15;
    }
    return score; // Max 100
}
function validateVideoQuality(analysis) {
    const errors = [];
    if (analysis.duration > 7200) {
        errors.push(`Video too long: ${Math.round(analysis.duration / 60)} minutes (max 120 minutes)`);
    }
    //Check QOE Score
    if (analysis.estimatedQuality < 30) {
        errors.push(`Video quality too low: score ${analysis.estimatedQuality}/100`);
    }
    return true;
}
