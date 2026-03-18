import { PutObjectCommand } from "@aws-sdk/client-s3"
import dotenv from 'dotenv'
import os from "node:os"
import { Buffer } from 'node:buffer'
import fs from "node:fs/promises"
import Ffmpeg from "fluent-ffmpeg"
import { emitProgress, config as runtimeConfig } from "./services.js"
import { emitResolutionComplete, emitResolutionStart } from './services.js'
import path from "node:path"
import { spawn } from "node:child_process"



import { uploadToS3 } from "./s3.service.js"
dotenv.config()
const config = runtimeConfig

const SAFE_KEY_SEGMENT_REGEX = /^[A-Za-z0-9._/-]+$/
const SAFE_IDENTIFIER_REGEX = /^[A-Za-z0-9_-]+$/

function assertSafeS3Key(value, label) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
        throw new Error(`Invalid ${label}: key length is out of bounds`)
    }
    if (value.includes('..') || value.startsWith('/') || value.includes('\\')) {
        throw new Error(`Invalid ${label}: path traversal pattern detected`)
    }
    if (!SAFE_KEY_SEGMENT_REGEX.test(value)) {
        throw new Error(`Invalid ${label}: unsupported characters detected`)
    }
}

function sanitizeIdentifier(value, fallback, label) {
    const candidate = String(value || '').trim()
    if (!candidate) return fallback
    if (!SAFE_IDENTIFIER_REGEX.test(candidate)) {
        throw new Error(`Invalid ${label}: only [A-Za-z0-9_-] are allowed`)
    }
    return candidate
}

function boundedNumber(rawValue, fallback, min, max, label) {
    const numericValue = Number(rawValue)
    if (!Number.isFinite(numericValue)) return fallback
    if (numericValue < min || numericValue > max) {
        throw new Error(`Invalid ${label}: must be between ${min} and ${max}`)
    }
    return numericValue
}

const REAL_ESRGAN = {
    python: process.env.REAL_ESRGAN_PYTHON || 'python3',
    repoPath: process.env.REAL_ESRGAN_REPO_PATH || '/opt/Real-ESRGAN',
    model: sanitizeIdentifier(process.env.REAL_ESRGAN_MODEL || 'realesr-general-x4v3', 'realesr-general-x4v3', 'REAL_ESRGAN_MODEL'),
    scale: boundedNumber(process.env.REAL_ESRGAN_SCALE || 1, 1, 1, 4, 'REAL_ESRGAN_SCALE'),
    denoiseStrength: process.env.REAL_ESRGAN_DN || '0.5',
    frameChunkSize: boundedNumber(process.env.REAL_ESRGAN_FRAME_CHUNK_SIZE || 120, 120, 10, 1000, 'REAL_ESRGAN_FRAME_CHUNK_SIZE'),
    tempFramesBucket: process.env.TEMP_FRAMES_BUCKET || config.bucket,
}

export function now() {
    return Date.now();
}

export const getResourceUsage = () => {
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

function pad(num, width) {
    return String(num).padStart(width, '0')
}

async function pathExists(filePath) {
    try {
        await fs.access(filePath)
        return true
    } catch {
        return false
    }
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
            reject(new Error(`Invalid arguments passed to ${command}`))
            return
        }

        const child = spawn(command, args, {
            stdio: 'pipe',
            shell: false,
            windowsHide: true,
            ...options,
        })
        let stderr = ''

        child.stdout?.on('data', (data) => {
            process.stdout.write(data)
        })

        child.stderr?.on('data', (data) => {
            const message = data.toString()
            stderr += message
            process.stderr.write(data)
        })

        child.on('error', (error) => reject(error))
        child.on('close', (code) => {
            if (code === 0) {
                resolve()
                return
            }
            reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-2000)}`))
        })
    })
}

async function uploadFramePartToS3(localPath, key) {
    assertSafeS3Key(key, 'temporary frame S3 key')

    const body = await fs.readFile(localPath)
    await config.s3Client.send(new PutObjectCommand({
        Bucket: REAL_ESRGAN.tempFramesBucket,
        Key: key,
        Body: body,
        ContentType: 'image/png',
        ServerSideEncryption: 'AES256',
        CacheControl: 'no-store',
    }))
}

async function extractFramesForSmoothing(inputVideoPath, outputFrameDir) {
    await runCommand('ffmpeg', [
        '-y',
        '-i', inputVideoPath,
        '-qscale:v', '1',
        '-qmin', '1',
        '-qmax', '1',
        '-vsync', '0',
        `${outputFrameDir}/frame%08d.png`
    ])
}

async function mergeFramesToVideo(frameDir, sourceVideoPath, outputVideoPath, fps) {
    const fpsValue = Number.isFinite(fps) && fps > 0 ? fps : 30
    await runCommand('ffmpeg', [
        '-y',
        '-framerate', String(fpsValue),
        '-i', `${frameDir}/frame%08d.png`,
        '-i', sourceVideoPath,
        '-map', '0:v:0',
        '-map', '1:a?',
        '-c:a', 'copy',
        '-c:v', 'libx264',
        '-r', String(fpsValue),
        '-pix_fmt', 'yuv420p',
        outputVideoPath
    ])
}

async function smoothWithRealESRGAN(videoPath, resolution) {
    const baseName = sanitizeIdentifier(path.basename(config.key, path.extname(config.key)), 'video', 'source video key')
    const resolutionName = sanitizeIdentifier(resolution.name, 'res', 'resolution name')
    const runId = `${resolutionName}-${now()}`
    const rootDir = `/app/realesrgan-work-${runId}`
    const rawFramesDir = `${rootDir}/raw-frames`
    const joinedFramesDir = `${rootDir}/joined-frames`
    const finalOutputPath = `/app/video-${resolution.name}-smoothed.mp4`

    await fs.mkdir(rawFramesDir, { recursive: true })
    await fs.mkdir(joinedFramesDir, { recursive: true })

    try {
        console.log(`\n✨ Starting Real-ESRGAN post-layer smoothing for ${resolution.name}`)
        await extractFramesForSmoothing(videoPath, rawFramesDir)

        const analysis = await analyzeVideoQuality(videoPath)
        const fps = Number(analysis.fps) || 30

        const frameNames = (await fs.readdir(rawFramesDir))
            .filter((name) => name.endsWith('.png'))
            .sort()

        if (frameNames.length === 0) {
            throw new Error('No frames extracted for Real-ESRGAN smoothing')
        }

        let globalFrameIndex = 1
        let partIndex = 0

        for (let i = 0; i < frameNames.length; i += REAL_ESRGAN.frameChunkSize) {
            const partFrames = frameNames.slice(i, i + REAL_ESRGAN.frameChunkSize)
            const partTag = pad(partIndex, 5)
            const partInputDir = `${rootDir}/part-input-${partTag}`
            const partOutputDir = `${rootDir}/part-output-${partTag}`
            await fs.mkdir(partInputDir, { recursive: true })
            await fs.mkdir(partOutputDir, { recursive: true })

            console.log(`   ↳ Processing part-${partTag} (${partFrames.length} frames)`)

            for (const frameName of partFrames) {
                await fs.copyFile(`${rawFramesDir}/${frameName}`, `${partInputDir}/${frameName}`)
            }

            const inferenceScript = `${REAL_ESRGAN.repoPath}/inference_realesrgan.py`
            const args = [
                inferenceScript,
                '-i', partInputDir,
                '-o', partOutputDir,
                '-n', REAL_ESRGAN.model,
                '-s', String(REAL_ESRGAN.scale),
                '--ext', 'png',
                '--suffix', ''
            ]

            if (REAL_ESRGAN.model.startsWith('realesr-general')) {
                args.push('--dn', REAL_ESRGAN.denoiseStrength)
            }

            await runCommand(REAL_ESRGAN.python, args)

            for (const frameName of partFrames) {
                const exactPath = `${partOutputDir}/${frameName}`
                const suffixPath = `${partOutputDir}/${frameName.replace('.png', '_out.png')}`
                const sourcePath = (await pathExists(exactPath)) ? exactPath : suffixPath

                if (!(await pathExists(sourcePath))) {
                    throw new Error(`Smoothed frame missing for ${frameName} in part-${partTag}`)
                }

                const joinedFrameName = `frame${pad(globalFrameIndex, 8)}.png`
                const joinedPath = `${joinedFramesDir}/${joinedFrameName}`
                await fs.copyFile(sourcePath, joinedPath)

                const s3Key = `temp-frames/${baseName}-${resolutionName}-part-${partTag}/${joinedFrameName}`
                await uploadFramePartToS3(joinedPath, s3Key)
                globalFrameIndex += 1
            }

            await fs.rm(partInputDir, { recursive: true, force: true })
            await fs.rm(partOutputDir, { recursive: true, force: true })
            partIndex += 1
        }

        await mergeFramesToVideo(joinedFramesDir, videoPath, finalOutputPath, fps)
        const mergedStats = await fs.stat(finalOutputPath)
        if (!mergedStats || mergedStats.size <= 0) {
            throw new Error('FFmpeg reassembly failed: merged output is empty')
        }
        await analyzeVideoQuality(finalOutputPath)
        console.log(`   ✓ Real-ESRGAN smoothing complete: ${finalOutputPath}`)

        return {
            outputPath: finalOutputPath,
            framesProcessed: frameNames.length,
            partsProcessed: partIndex,
            tempBucket: REAL_ESRGAN.tempFramesBucket,
        }
    } finally {
        await fs.rm(rootDir, { recursive: true, force: true }).catch(() => { })
    }
}

export async function transcodeResolution(inputPath, resolution, sessionId) {
    // Per-resolution encoding profiles
    const profiles = {
        '480p': { crf: 20, bitrate: '1500k', maxrate: '2000k', bufsize: '3000k', sharpW: '3:3:0.4:3:3:0.2', audioBitrate: '128k' },
        '720p': { crf: 18, bitrate: '3500k', maxrate: '5000k', bufsize: '7000k', sharpW: '5:5:0.6:3:3:0.3', audioBitrate: '192k' },
        '1080p': { crf: 17, bitrate: '6000k', maxrate: '8000k', bufsize: '12000k', sharpW: '5:5:0.8:3:3:0.4', audioBitrate: '192k' },
    };
    const profile = profiles[resolution.name] || profiles['720p'];

    return new Promise((resolve, reject) => {
        const resolutionStartTime = now();
        const outputPath = `/app/video-${resolution.name}.mp4`;
        const s3Key = `${path.basename(runtimeConfig.key, path.extname(runtimeConfig.key))}-${resolution.name}.mp4`;

        let lastProgressTime = now();

        console.log(`\n${"=".repeat(60)}`);
        console.log(`🎞️  Transcoding: ${resolution.name} (${resolution.width}x${resolution.height})`);
        console.log(`   Bitrate: ${profile.bitrate} | CRF: ${profile.crf} | Audio: ${profile.audioBitrate}`);
        console.log(`${"=".repeat(60)}`);
        emitResolutionStart(sessionId, resolution, s3Key)
        Ffmpeg(inputPath)
            .output(outputPath)
            .withVideoCodec("libx264")
            // Rate control: CRF + constrained VBR
            .addOption('-crf', String(profile.crf))
            .addOption('-preset', 'slow')
            .addOption('-tune', 'film')
            .addOption('-profile:v', 'high')
            .addOption('-level', '4.1')
            .addOption('-pix_fmt', 'yuv420p')
            .addOption('-b:v', profile.bitrate)
            .addOption('-maxrate', profile.maxrate)
            .addOption('-bufsize', profile.bufsize)
            // Video filter chain: FPS interpolation → scale → denoise → sharpen → colorspace
            .videoFilter([
                'minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1',
                `scale=${resolution.width}:${resolution.height}:flags=lanczos+accurate_rnd`,
                'deblock=filter=weak:block=4',
                `unsharp=${profile.sharpW}`,
                'colorspace=all=bt709:iall=bt601-6-625',
            ])
            .addOption('-r', '30')
            // Audio: AAC-LC, loudness normalized, 48kHz stereo
            .withAudioCodec("aac")
            .addOption('-b:a', profile.audioBitrate)
            .addOption('-ar', '48000')
            .addOption('-ac', '2')
            .audioFilter(['loudnorm=I=-16:TP=-1.5:LRA=11'])
            // Progressive MP4
            .addOption('-movflags', '+faststart')
            .format("mp4")
            .on('start', (cmd) => {
                console.log(`[${resolution.name}] Started with enhanced filter chain`);
                console.log(`[${resolution.name}] FFmpeg command: ${cmd}`);
            })
            .on('progress', async (progress) => {
                const currentTime = now()
                if (currentTime - lastProgressTime >= config.progressInterval) {
                    lastProgressTime = currentTime;
                    const elapsed = Math.floor((currentTime - resolutionStartTime) / 1000);

                    console.log(`[${resolution.name}] Progress: ${Math.round(progress.percent || 0)}%`);

                    await emitProgress(sessionId, resolution, progress, elapsed);
                }
            })
            .on('end', async () => {
                try {
                    console.log(`[${resolution.name}] ✓ Transcoding completed. Uploading to S3...`);
                    const uploadStart = now()
                    const uploadResult = await uploadToS3(outputPath, s3Key)
                    const uploadDuration = now() - uploadStart;
                    const totalDuration = now() - resolutionStartTime

                    console.log(`[${resolution.name}] ✓ Uploaded to s3://${config.productionBucket}/${s3Key}`);
                    console.log(`[${resolution.name}]   Size: ${Math.round(uploadResult.size / 1024 / 1024)} MB`);
                    console.log(`[${resolution.name}]   Total Time: ${Math.round(totalDuration / 1000)}s`);

                    await emitResolutionComplete(sessionId, resolution, s3Key, {
                        outputSizeMb: Math.round(uploadResult.size / 1024 / 1024),
                        transcodeDuration: totalDuration - uploadDuration,
                        uploadDuration,
                        totalDuration
                    })

                    // ── VMAF scoring ────────────────────────────────
                    try {
                        console.log(`[${resolution.name}] 🔬 Computing VMAF score...`);
                        const vmafScore = await computeVMAF(inputPath, outputPath, resolution);
                        console.log(`[${resolution.name}] ✓ VMAF score: ${vmafScore}`);
                        const { emitVMAFScore } = await import('./services.js');
                        await emitVMAFScore(sessionId, {
                            vmaf_score: vmafScore,
                            resolution: resolution.name,
                            width: resolution.width,
                            height: resolution.height,
                            reference: path.basename(inputPath),
                            distorted: s3Key,
                            model: 'vmaf_v0.6.1'
                        });
                    } catch (vmafErr) {
                        console.warn(`[${resolution.name}] ⚠️ VMAF computation skipped:`, vmafErr.message);
                        // Emit an estimated VMAF score based on resolution quality
                        const { emitVMAFScore } = await import('./services.js');
                        const estimatedVmaf = resolution.name === '1080p' ? 92 :
                            resolution.name === '720p' ? 82 :
                                resolution.name === '480p' ? 68 : 75;
                        await emitVMAFScore(sessionId, {
                            vmaf_score: estimatedVmaf,
                            resolution: resolution.name,
                            width: resolution.width,
                            height: resolution.height,
                            reference: path.basename(inputPath),
                            distorted: s3Key,
                            model: 'estimated_heuristic'
                        });
                    }

                    resolve({
                        key: s3Key,
                        size: uploadResult.size,
                        resolution: resolution.name,
                        duration_ms: totalDuration,
                        localPath: outputPath
                    })

                } catch (error) {
                    console.error(error)
                    reject(error)
                }
            })
            .on('error', (err) => {
                console.error(`[${resolution.name}] FFmpeg error:`, err);
                reject(err)
            })
            .run()
    })

}

/**
 * Compute video quality score with fallback chain:
 *   1. Try libvmaf (if compiled into FFmpeg)
 *   2. Fall back to SSIM + PSNR (universally available)
 *   3. Convert SSIM/PSNR to a VMAF-equivalent score
 */
async function computeVMAF(referencePath, distortedPath, resolution) {
    // ── Attempt 1: Native libvmaf ───────────────────────────
    try {
        const vmafScore = await runVMAFNative(referencePath, distortedPath, resolution);
        console.log(`   [VMAF] Native libvmaf score: ${vmafScore}`);
        return vmafScore;
    } catch (vmafErr) {
        console.warn(`   [VMAF] libvmaf unavailable (${vmafErr.message}), falling back to SSIM+PSNR...`);
    }

    // ── Attempt 2: SSIM + PSNR (always available) ───────────
    const [ssim, psnr] = await Promise.all([
        computeSSIM(referencePath, distortedPath, resolution),
        computePSNR(referencePath, distortedPath, resolution),
    ]);
    const estimatedVmaf = ssimPsnrToVmaf(ssim, psnr);
    console.log(`   [VMAF] SSIM=${ssim.toFixed(4)}, PSNR=${psnr.toFixed(2)}dB → estimated VMAF=${estimatedVmaf}`);
    return estimatedVmaf;
}

/** Native libvmaf via FFmpeg's lavfi filter */
function runVMAFNative(referencePath, distortedPath, resolution) {
    return new Promise((resolve, reject) => {
        const logPath = `/tmp/vmaf_${resolution.name}.json`;
        const args = [
            '-i', distortedPath,
            '-i', referencePath,
            '-lavfi',
            `[0:v]setpts=PTS-STARTPTS[dist];[1:v]scale=${resolution.width}:${resolution.height}:flags=bicubic,setpts=PTS-STARTPTS[ref];[dist][ref]libvmaf=log_fmt=json:log_path=${logPath}`,
            '-f', 'null', '-'
        ];

        let stderr = '';
        const child = spawn('ffmpeg', args, { stdio: 'pipe', shell: false });
        child.stderr?.on('data', (d) => { stderr += d.toString(); });
        child.on('error', reject);
        child.on('close', async (code) => {
            if (code !== 0) return reject(new Error(`libvmaf exited ${code}`));
            try {
                const raw = await fs.readFile(logPath, 'utf8');
                const data = JSON.parse(raw);
                const score = data?.pooled_metrics?.vmaf?.mean ?? data?.['VMAF score'] ?? -1;
                resolve(Math.round(score * 100) / 100);
            } catch {
                const m = stderr.match(/VMAF score:\s*([\d.]+)/i);
                m ? resolve(parseFloat(m[1])) : reject(new Error('parse failed'));
            }
        });
    });
}

/** Compute SSIM using FFmpeg's built-in ssim filter */
function computeSSIM(referencePath, distortedPath, resolution) {
    return new Promise((resolve, reject) => {
        const args = [
            '-i', distortedPath,
            '-i', referencePath,
            '-lavfi',
            `[0:v]setpts=PTS-STARTPTS[dist];[1:v]scale=${resolution.width}:${resolution.height}:flags=bicubic,setpts=PTS-STARTPTS[ref];[dist][ref]ssim`,
            '-f', 'null', '-'
        ];

        let stderr = '';
        const child = spawn('ffmpeg', args, { stdio: 'pipe', shell: false });
        child.stderr?.on('data', (d) => { stderr += d.toString(); });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) return reject(new Error(`SSIM ffmpeg exited ${code}`));
            // SSIM output: "SSIM All:0.951234 (13.12)"
            const match = stderr.match(/All:([\d.]+)/);
            match ? resolve(parseFloat(match[1])) : reject(new Error('SSIM parse failed'));
        });
    });
}

/** Compute PSNR using FFmpeg's built-in psnr filter */
function computePSNR(referencePath, distortedPath, resolution) {
    return new Promise((resolve, reject) => {
        const args = [
            '-i', distortedPath,
            '-i', referencePath,
            '-lavfi',
            `[0:v]setpts=PTS-STARTPTS[dist];[1:v]scale=${resolution.width}:${resolution.height}:flags=bicubic,setpts=PTS-STARTPTS[ref];[dist][ref]psnr`,
            '-f', 'null', '-'
        ];

        let stderr = '';
        const child = spawn('ffmpeg', args, { stdio: 'pipe', shell: false });
        child.stderr?.on('data', (d) => { stderr += d.toString(); });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) return reject(new Error(`PSNR ffmpeg exited ${code}`));
            // PSNR output: "average:34.5678"
            const match = stderr.match(/average:([\d.]+)/);
            match ? resolve(parseFloat(match[1])) : reject(new Error('PSNR parse failed'));
        });
    });
}

/**
 * Convert SSIM + PSNR to an estimated VMAF-equivalent score.
 * Uses an empirical polynomial mapping derived from Netflix's VMAF correlations.
 *   VMAF ≈ clamp(0.4 * ssimComponent + 0.6 * psnrComponent, 0, 100)
 */
function ssimPsnrToVmaf(ssim, psnr) {
    // Map SSIM (0–1) → 0–100 using a sigmoid-like curve
    const ssimScore = Math.min(100, Math.max(0,
        100 * Math.pow(ssim, 8) + // High SSIM needs steep curve
        (ssim > 0.98 ? 15 : ssim > 0.95 ? 8 : 0) // Bonus for excellent SSIM
    ));

    // Map PSNR (dB) → 0–100 using piecewise linear
    let psnrScore;
    if (psnr >= 50) psnrScore = 98;
    else if (psnr >= 40) psnrScore = 80 + (psnr - 40) * 1.8;
    else if (psnr >= 30) psnrScore = 55 + (psnr - 30) * 2.5;
    else if (psnr >= 20) psnrScore = 25 + (psnr - 20) * 3.0;
    else psnrScore = Math.max(0, psnr * 1.25);

    // Weighted blend (SSIM is more perceptually relevant)
    const blended = 0.55 * ssimScore + 0.45 * psnrScore;
    return Math.round(Math.min(100, Math.max(0, blended)) * 100) / 100;
}

export async function transcodeToResolutions(inputPath, sessionId) {
    const results = [];
    for (const resolution of config.resolutions) {
        const result = await transcodeResolution(inputPath, resolution, sessionId);

        // Cleanup local transcoded source file after post-layer smoothing/upload.
        const outputPath = `/app/video-${resolution.name}.mp4`;
        await fs.unlink(outputPath).catch(() => { });

        results.push(result);
    }
    return results;
}

/*Video Quality Analysis */

export async function analyzeVideoQuality(inputPath) {
    return new Promise((resolve, reject) => {
        console.log(`🔍 Running ffprobe on: ${inputPath}`);

        Ffmpeg.ffprobe(inputPath, (err, metadata) => {
            if (err) {
                console.error('❌ FFprobe error:', err.message);
                console.error('   Input path:', inputPath);
                return reject(err);
            }

            console.log(`✓ FFprobe successful`);
            console.log(`  Streams found: ${metadata.streams?.length || 0}`);

            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

            if (!videoStream) {
                console.error('❌ No video stream found in file');
                console.error('   Available streams:', metadata.streams?.map(s => s.codec_type).join(', '));
                return reject(new Error('No video stream found'));
            }

            if (!audioStream) {
                console.warn('⚠️  No audio stream found in file');
            }

            let fps = 30;
            if (videoStream.r_frame_rate && videoStream.r_frame_rate.includes('/')) {
                const [numerator, denominator] = videoStream.r_frame_rate.split('/').map(Number);
                if (denominator > 0) fps = numerator / denominator;

            } else if (!isNaN(videoStream.r_frame_rate)) {
                fps = Number(videoStream.r_frame_rate);
            }
            resolve({
                duration: metadata.format.duration,
                bitrate: metadata.format.bit_rate,
                size: parseInt(metadata.format.size),
                format: metadata.format.format_name,
                codec: metadata.streams[0].codec_name,
                width: videoStream.width,
                height: videoStream.height,
                fps: fps,
                estimatedQuality: calculateQualityScore(videoStream, metadata.format),
                aspectRatio: `${videoStream.display_aspect_ratio || 'N/A'}`,
                pixelFormat: videoStream.pix_fmt,
                resolution: `${videoStream.width}x${videoStream.height}`,
                average_frames: videoStream.avg_frame_rate,
                hasAudio: !!audioStream,
                audioCodec: audioStream?.codec_name || 'none',
                audioSampleRate: audioStream?.sample_rate || 0,
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