# MobCloudX

![AI](https://img.shields.io/badge/AI-XGBoost%20%7C%20ESRGAN%20%7C%20Federated%20Learning-green)
![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20Web-blue)
![Trust](https://img.shields.io/badge/Trust-Zero--Knowledge%20%7C%20Blockchain-purple)
![Status](https://img.shields.io/badge/Status-Active%20Development-orange)

## What is MobCloudX?

MobCloudX is an end-to-end AI-powered Quality of Experience (QoE) Intelligence Platform for adaptive video streaming in mobile cloud environments. It doesn't just measure video quality — it **understands it, reacts to it, personalizes it, and cryptographically proves it**.

The platform is built around a multi-agent AI architecture running both on-device (Android SDK) and in the cloud, orchestrating real-time monitoring, autonomous adaptation, context-aware personalization, and zero-trust verification — all in a single cohesive system.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ANDROID SDK (On-Device)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐  ┌──────────┐ │
│  │ Video Agent │  │ Audio Agent │  │Telemetry Agent│  │ZK Client │ │
│  │ Real-time   │  │ Artifact    │  │Jitter/Buffer  │  │Proof Sign│ │
│  │ QoE Scoring │  │ Detection   │  │/Throughput    │  │& Publish │ │
│  └──────┬──────┘  └──────┬──────┘  └───────┬───────┘  └────┬─────┘ │
└─────────┼────────────────┼─────────────────┼────────────────┼───────┘
          │                │                 │                │
          ▼                ▼                 ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     CLOUD BACKEND (AI Microservices)                │
│                                                                     │
│  Kafka Ingestion → MongoDB Storage → AI Inference Fusion            │
│                                                                     │
│  ┌──────────────────┐  ┌───────────────────┐  ┌───────────────────┐ │
│  │ Adaptation Agent │  │  FL Server        │  │  ZK Aggregator    │ │
│  │ XGBoost Predictor│  │  Federated Model  │  │  Polygon Goerli   │ │
│  │ Bitrate/Preset   │  │  Aggregation      │  │  Blockchain Proof │ │
│  │ Decision Engine  │  │  (Privacy-Safe)   │  │  Anchoring        │ │
│  └──────────────────┘  └───────────────────┘  └───────────────────┘ │
│                                                                     │
│  Next.js Dashboard      │  Grafana Observability                    │
│  VMAF/QoE Visualization │  Prometheus + Loki Logs                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Objectives & Build Status

### ✅ Objective 1 — Real-Time QoE Monitoring (COMPLETE)

Designed and deployed lightweight AI monitoring mechanisms inside an Android SDK:

- Real-time QoE scoring with on-device metrics collection
- Audio artifact detection in real-time
- Telemetry pipeline: jitter, buffering events, and throughput extraction
- Data streamed via Apache Kafka and persisted in MongoDB Atlas

### ✅ Objective 2 — Dynamic Adaptation Engine (COMPLETE)

Autonomous adaptation layer powered by machine learning:

- **XGBoost Throughput Predictor** — trained on 25K synthetic AR(1) sessions (MAPE 6.12%)
- Takes real-time QoE scores, network load, and buffer health as input
- Autonomously adjusts bitrate and resolution (360p/480p/720p/1080p)
- Closes the monitoring→action loop without human intervention
- Model version: `xgb-fl-v1` with federated learning integration

### ✅ Objective 3 — Video Enhancement Pipeline (COMPLETE)

AI-powered video transcoding and super-resolution:

- **RealESRGAN 4× Upscaling** — anime-optimized super-resolution
- Multi-resolution transcoding (480p/720p/1080p) with CAS sharpening
- VMAF quality scoring for perceptual quality validation
- S3-based CDN delivery with adaptive bitrate streaming
- Docker-based transcoding pipeline with ECS task orchestration

### 🔄 Objective 4 — Context-Aware Personalization (IN PROGRESS)

Context-intelligent personalization without compromising user privacy:

- Federated Learning — models trained locally on-device; only encrypted model updates sent to cloud
- Context Management Layer ingesting device metadata, network type (WiFi/4G/5G), and battery status
- Federated Learning Agent on the server for secure update aggregation
- Personalizes QoE decisions per user profile: device tier, network signal, location context

### 🔄 Objective 5 — Zero-Trust QoE Verification (IN PROGRESS)

Cryptographic proof of service quality for OTT platforms and SLA enforcement:

- ZK Proof Agent — signs every QoE score and bundles it into a zero-knowledge cryptographic proof
- Proof hash anchored on Polygon Goerli blockchain
- Gives OTT operators a tamper-proof, auditable quality log
- Enables SLA dispute resolution without exposing any private user data

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **On-Device AI** | XGBoost, Android SDK (Kotlin/Java), Expo (React Native) |
| **Streaming / ABR** | XGBoost-based ABR Controller, Adaptive Bitrate Streaming |
| **Data Pipeline** | Apache Kafka, MongoDB Atlas, Kafka Consumer (Node.js) |
| **Adaptation AI** | XGBoost Throughput Predictor (6.12% MAPE) |
| **Privacy AI** | Federated Learning (on-device training + secure aggregation) |
| **Super-Resolution** | RealESRGAN 4× Upscaling (anime model) |
| **Video Processing** | FFmpeg, CAS Sharpening, VMAF Scoring |
| **ZK / Trust** | Zero-Knowledge Proofs, Polygon Goerli Blockchain |
| **Observability** | Grafana, Prometheus, Loki |
| **Frontend** | Next.js Dashboard, React Components |
| **DevOps** | Docker Compose, AWS ECS, S3 CDN |
| **Cloud** | AWS (S3, ECS, MongoDB Atlas) |

---

## Key Features

🎯 **Real-time QoE Scoring** — frame-level visual + audio quality analysis on Android  
🤖 **Autonomous Adaptation** — XGBoost predictor dynamically tunes streaming parameters  
🔒 **Privacy-First Personalization** — federated learning with zero raw data exposure  
⛓️ **Blockchain-Verified Quality** — ZK proofs anchored on-chain for SLA auditability  
📡 **Cellular Network Support** — ngrok tunneling for 4G/5G testing  
🔍 **4× Super-Resolution** — RealESRGAN upscaling for low-bandwidth streams  
📊 **Full Observability Stack** — Grafana dashboards, Prometheus metrics, Loki logs  
🎬 **VMAF Quality Scoring** — perceptual video quality validation (0-100 scale)  
🧪 **Demo Mode System** — network simulator (3G/4G/WiFi-6) for testing adaptation logic

---

## Project Structure

```
mobcloudx/
├── sdk/                      # React Native Expo SDK (Video Player + Telemetry)
│   ├── expo-app/             # Android app with adaptive streaming
│   └── src/                  # SDK core (telemetry, QoE, adaptation hooks)
├── producer/                 # Hono.js REST API (Kafka producer)
├── consumer/                 # Node.js Kafka consumer (MongoDB writer)
├── inference/                # FastAPI inference service
│   ├── app.py                # Adaptation decision engine
│   ├── bridge.py             # Federated learning bridge
│   └── models/               # XGBoost model + scaler
├── realesgran/               # Video transcoding + super-resolution
│   ├── train_xgb.py          # XGBoost training script
│   └── generate_sessions.py # Synthetic data generator
├── videoTranscoding/         # FFmpeg transcoding pipeline
│   └── container/            # Docker-based transcoder
├── client/                   # Next.js dashboard
│   ├── app/                  # App router pages
│   └── components/           # React components (comparison, jobs, etc.)
├── grafana/                  # Grafana dashboards + datasources
├── docker-compose.yml        # Full stack orchestration
└── .env.example              # Environment variables template
```

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- Python 3.11+ (for training scripts)
- Android device or emulator (for SDK testing)
- MongoDB Atlas account (free tier works)
- AWS S3 bucket (for video storage)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/mobcloudx.git
cd mobcloudx

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your MongoDB URI, S3 credentials, etc.

# 3. Start backend services
docker-compose up -d

# 4. Verify services are running
docker-compose ps

# 5. Run the Android SDK demo app
cd sdk/expo-app
npm install
npx expo run:android
```

### Training the XGBoost Model

```bash
cd realesgran

# 1. Generate synthetic training data (25K sessions)
python generate_sessions.py --sessions 25000

# 2. Train XGBoost predictor
python train_xgb.py --estimators 500 --lr 0.1

# Model saved to: inference/models/throughput_xgb.pkl
# Expected MAPE: < 8% (achieved 6.12%)
```

### Running Video Transcoding

```bash
# Transcode a video with ESRGAN upscaling
cd videoTranscoding
node run-local-transcode.js --input ./raw_video.mp4

# Output: 480p, 720p, 1080p variants with VMAF scores
```

---

## Demo System

The full demo layers the entire stack end-to-end:

1. **Android App** runs Video, Audio, Telemetry, and ZK Proof agents in real time
2. **Kafka** ingests all telemetry from the device via Producer API
3. **Consumer** writes telemetry to MongoDB Atlas
4. **Inference Service** scores QoE and makes adaptation decisions using XGBoost
5. **Adaptation Agent** tunes playback parameters (resolution/bitrate) in response
6. **FL Server** manages federated personalization model (in progress)
7. **ZK Aggregator** posts proof hashes to Polygon Goerli (in progress)
8. **Next.js Dashboard** visualizes everything live with VMAF/QoE comparisons

### Network Simulator

The SDK includes a network simulator for testing adaptation logic:

- **3G** — 1.5 Mbps, high jitter → triggers 360p
- **4G-degraded** — 8 Mbps, moderate jitter → triggers 480p
- **4G-stable** — 25 Mbps, low jitter → triggers 720p
- **WiFi-6** — 85 Mbps, minimal jitter → triggers 1080p

---

## API Endpoints

### Producer (Port 3001)

```bash
POST /telemetry-service          # Ingest SDK telemetry
POST /transcode-event             # Ingest transcoding events
GET  /health                      # Health check
```

### Inference (Port 8000)

```bash
POST /adaptation/decision/compute/:sessionId  # Get adaptation decision
GET  /fl/*                                    # Federated learning endpoints
GET  /health                                  # Health check
```

### Client Dashboard (Port 3000)

```bash
GET  /                            # Landing page
GET  /dashboard                   # Main dashboard
GET  /api/comparison              # VMAF/QoE comparison data
GET  /api/jobs/recent             # Recent transcoding jobs
GET  /api/vmaf/latest             # Latest VMAF scores
```

---

## Roadmap

- [x] Real-time QoE monitoring on Android
- [x] Kafka + MongoDB telemetry pipeline
- [x] XGBoost Adaptation Agent (6.12% MAPE)
- [x] RealESRGAN 4× super-resolution
- [x] VMAF quality scoring
- [x] Next.js dashboard with comparison view
- [x] Cellular network support (ngrok)
- [ ] Federated Learning agent + context layer (in progress)
- [ ] ZK Proof + Polygon anchoring (in progress)
- [ ] iOS SDK support
- [ ] Multi-tenant OTT SDK packaging
- [ ] Public SLA verification portal

---

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

---

## License

MIT License - see LICENSE file for details

---

## Acknowledgments

- RealESRGAN for super-resolution models
- XGBoost for gradient boosting framework
- Netflix VMAF for perceptual quality metrics
- Expo for React Native development platform

---

**Built with ❤️ for the future of adaptive streaming**
