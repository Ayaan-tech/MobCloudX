"""
MobCloudX Inference Service — VMAF Analytics & Quality Intelligence

Provides:
- VMAF score analytics (aggregations, trends, per-resolution breakdowns)
- Quality intelligence endpoints for the dashboard
- Historical VMAF data querying from MongoDB
"""

import os
import json
import uuid
import hashlib
import asyncio
from datetime import datetime, timedelta
from typing import Optional
from urllib import request as urlrequest
from urllib.error import URLError, HTTPError

from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from inference.webrtc_metrics import render_metrics

load_dotenv()

# ── Configuration ─────────────────────────────────────────────

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI environment variable is required but not set.")
MONGO_DB = os.getenv("MONGO_DB", "test")
PORT = int(os.getenv("INFERENCE_PORT", "8000"))
PRODUCER_API_URL = os.getenv("PRODUCER_API_URL", "http://producer:3001")

# ── App Setup ─────────────────────────────────────────────────

from contextlib import asynccontextmanager

_client: MongoClient = None  # type: ignore
_db = None
_async_client: AsyncIOMotorClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _client, _db, _async_client
    _client = MongoClient(MONGO_URI)
    _db = _client[MONGO_DB]
    _async_client = AsyncIOMotorClient(MONGO_URI)
    app.state.mongo_async_client = _async_client
    app.state.mongo_async_db = _async_client[MONGO_DB]
    print(f"✓ Connected to MongoDB: {MONGO_DB}")

    from inference.db.webrtc_collections import ensure_webrtc_collections
    from inference.kafka.webrtc_topics import ensure_webrtc_topics, get_webrtc_topic_health
    from inference.consumers.webrtc_telemetry_consumer import WebRTCTelemetryConsumer
    from inference.fl.server import FLServer

    await ensure_webrtc_collections(app.state.mongo_async_db)
    topic_results = await asyncio.to_thread(ensure_webrtc_topics)
    app.state.webrtc_topic_health = await asyncio.to_thread(get_webrtc_topic_health)
    print(f"✓ WebRTC Kafka topics ready: {topic_results}")

    app.state.webrtc_consumer = WebRTCTelemetryConsumer(app.state.mongo_async_db)
    app.state.webrtc_consumer_task = asyncio.create_task(app.state.webrtc_consumer.run())
    app.state.webrtc_fl_server = FLServer(app.state.mongo_async_db)
    app.state.webrtc_fl_task = asyncio.create_task(app.state.webrtc_fl_server.start_periodic_webrtc_fl())
    yield
    consumer = getattr(app.state, "webrtc_consumer", None)
    consumer_task = getattr(app.state, "webrtc_consumer_task", None)
    fl_server = getattr(app.state, "webrtc_fl_server", None)
    fl_task = getattr(app.state, "webrtc_fl_task", None)
    if consumer is not None:
        await consumer.stop()
    if consumer_task is not None:
        await consumer_task
    if fl_server is not None:
        await fl_server.stop()
    if fl_task is not None:
        await fl_task
    if _async_client is not None:
        _async_client.close()
    if _client:
        _client.close()


app = FastAPI(
    title="MobCloudX Inference – VMAF Analytics",
    version="1.0.0",
    description="VMAF perceptual quality analytics and quality intelligence",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount FL Bridge ───────────────────────────────────────────
# Federated Learning endpoints available at /fl/*
try:
    from inference.bridge import router as fl_router
    app.include_router(fl_router)
    print("✓ FL Bridge router mounted at /fl/*")
except ImportError as e:
    print(f"⚠ FL Bridge not available: {e}")

try:
    from inference.routers.webrtc_router import router as webrtc_router
    app.include_router(webrtc_router, prefix="/api/v1")
    print("✓ WebRTC router mounted at /api/v1/webrtc/*")
except ImportError as e:
    print(f"⚠ WebRTC router not available: {e}")

try:
    from inference.routers.zk_router import router as zk_router
    app.include_router(zk_router)
    print("✓ ZK router mounted at /zk/*")
except ImportError as e:
    print(f"⚠ ZK router not available: {e}")

try:
    from inference.routers.fl_router import router as webrtc_fl_router
    app.include_router(webrtc_fl_router, prefix="/api/v1")
    print("✓ WebRTC FL router mounted at /api/v1/fl/webrtc/*")
except ImportError as e:
    print(f"⚠ WebRTC FL router not available: {e}")


# ── MongoDB helper ────────────────────────────────────────────

def get_db():
    if _db is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Database not ready. Try again shortly.")
    return _db




# ── Pydantic Models ───────────────────────────────────────────


class VMAFSummary(BaseModel):
    total_scores: int
    avg_vmaf: float
    min_vmaf: float
    max_vmaf: float
    median_vmaf: float
    scores_by_resolution: dict
    quality_distribution: dict  # excellent/good/fair/poor counts
    trend: list  # time-series data


class VMAFHealthResponse(BaseModel):
    status: str
    mongo_connected: bool
    vmaf_collection_count: int


class AdaptationDecisionResponse(BaseModel):
    sessionId: str
    decision: str
    target_resolution: Optional[int] = None
    target_bitrate: Optional[int] = None
    target_codec: Optional[str] = None
    congestion_probability: float = 0.0
    recommended_action: str = "normal"
    prefetch_seconds: int = 10
    urgency: str = "normal"
    reason: str
    confidence: float
    ts: int
    model_version: str
    inference_latency_ms: int


class FederatedUpdatePayload(BaseModel):
    device_id: str
    session_id: Optional[str] = None
    model_version: str
    qoe_baseline: float
    update: dict
    ts: Optional[int] = None


class FederatedModelResponse(BaseModel):
    model_id: str
    model_version: str
    global_weights: dict
    total_updates: int
    updated_at: str


class ZKProofPayload(BaseModel):
    session_id: str
    qoe_score: float
    ts: int
    metadata: Optional[dict] = None


# ── Helper Functions ──────────────────────────────────────────


def classify_vmaf(score: float) -> str:
    """Classify VMAF score into quality category (Netflix scale)."""
    if score >= 93:
        return "excellent"
    elif score >= 80:
        return "good"
    elif score >= 60:
        return "fair"
    else:
        return "poor"


def _num(value, default=0.0) -> float:
    if value is None:
        return float(default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _publish_decision_to_producer(session_id: str, decision: dict) -> bool:
    payload = json.dumps(decision).encode("utf-8")
    req = urlrequest.Request(
        f"{PRODUCER_API_URL}/adaptation/decision/{session_id}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=5) as resp:
            return 200 <= resp.status < 300
    except (URLError, HTTPError, TimeoutError):
        return False


def _normalize_fl_weights(raw_weights) -> dict:
    defaults = {"buffer_weight": 1.0, "jitter_weight": 1.0, "qoe_weight": 1.0}

    if isinstance(raw_weights, dict):
        return {
            "buffer_weight": _num(raw_weights.get("buffer_weight"), defaults["buffer_weight"]),
            "jitter_weight": _num(raw_weights.get("jitter_weight"), defaults["jitter_weight"]),
            "qoe_weight": _num(raw_weights.get("qoe_weight"), defaults["qoe_weight"]),
        }

    if isinstance(raw_weights, list):
        # WebRTC FL models may store positional weights. Map first 3 indices for adaptation.
        return {
            "buffer_weight": _num(raw_weights[0] if len(raw_weights) > 0 else None, defaults["buffer_weight"]),
            "jitter_weight": _num(raw_weights[1] if len(raw_weights) > 1 else None, defaults["jitter_weight"]),
            "qoe_weight": _num(raw_weights[2] if len(raw_weights) > 2 else None, defaults["qoe_weight"]),
        }

    return defaults


def _get_fl_weights() -> dict:
    """Load latest FL weights from federated_models. Returns defaults if none exist."""
    try:
        database = get_db()
        model = database["federated_models"].find_one(
            sort=[("updated_at", -1)], projection={"_id": 0, "global_weights": 1}
        )
        if model and model.get("global_weights"):
            return _normalize_fl_weights(model["global_weights"])
    except Exception:
        pass
    return _normalize_fl_weights(None)


def _get_throughput_prediction(session_id: str) -> float:
    """Get XGBoost throughput prediction for the session. Returns -1 if unavailable."""
    try:
        from inference.models.throughput_predictor import get_predictor
        predictor = get_predictor()
        if not predictor.is_available():
            return -1.0

        database = get_db()

        # Fetch real QoE from transcoding job (0-100 scale → normalize to 0-10)
        qoe_doc = database["qoe_scores"].find_one(
            {}, sort=[("ts", -1)],
            projection={"_id": 0, "qoe": 1}
        )
        real_qoe_score = (qoe_doc.get("qoe", 50) / 10.0) if qoe_doc else 5.0

        # Fetch last 5 telemetry_data events for this session
        docs = list(
            database["telemetry_data"]
            .find({"sessionId": session_id}, {"_id": 0, "metrics": 1, "ts": 1})
            .sort("ts", -1)
            .limit(5)
        )
        if len(docs) < 2:
            return -1.0

        docs.reverse()  # oldest first

        # Map telemetry_data fields → predictor schema (FEATURE_COLS)
        mapped_docs = []
        for doc in docs:
            m = doc.get("metrics", {})

            bitrate_mbps  = float(m.get("bitrate", 0) or 0)
            throughput_kbps = bitrate_mbps * 1000          # Mbps → kbps

            buffer_ms     = float(m.get("buffer_health_ms", 0) or 0)
            buffer_health = min(buffer_ms / 10000.0, 1.0)  # 10 s = 1.0

            latency       = float(m.get("audio_latency_ms", 0) or 0)
            rebuffering   = 1.0 if m.get("is_buffering") else 0.0

            mapped_docs.append({
                "throughput_kbps": throughput_kbps,
                "buffer_health":   buffer_health,
                "bitrate":         bitrate_mbps,
                "latency":         latency,
                "rebuffering":     rebuffering,
                "qoe_score":       real_qoe_score,  # from qoe_scores collection
            })

        return predictor.predict(mapped_docs)
    except Exception as e:
        print(f"[_get_throughput_prediction] Error: {e}")
        return -1.0


def _build_decision_from_features(session_id: str, features: dict) -> AdaptationDecisionResponse:
    start = datetime.utcnow()

    buffer_ms = _num(features.get("buffer_health_ms"), 0)
    jitter = _num(features.get("jitter"), 0)
    packet_loss = _num(features.get("audio_packet_loss_pct"), 0)
    qoe = _num(features.get("qoe"), 50)
    vmaf = _num(features.get("vmaf_score"), 75)
    bitrate = _num(features.get("bitrate"), 0)

    # ── Load FL-tuned weights ──────────────────────────────────
    fl = _get_fl_weights()
    buf_w = _num(fl.get("buffer_weight"), 1.0)
    jit_w = _num(fl.get("jitter_weight"), 1.0)
    qoe_w = _num(fl.get("qoe_weight"), 1.0)

    # FL-tuned thresholds (weights modulate sensitivity)
    buffer_threshold_low = 1500 * max(0.5, buf_w)
    buffer_threshold_high = 6000 * max(0.5, buf_w)
    jitter_threshold_high = 80 * max(0.5, jit_w)
    jitter_threshold_low = 25 * max(0.5, jit_w)
    qoe_threshold_low = 50 * max(0.5, qoe_w)
    qoe_threshold_high = 75 * max(0.5, qoe_w)

    # ── LSTM throughput prediction ─────────────────────────────
    predicted_throughput = _get_throughput_prediction(session_id)
    lstm_available = predicted_throughput > 0

    decision = "maintain"
    target_resolution = None
    congestion_probability = 0.0
    recommended_action = "normal"
    prefetch_seconds = 10
    urgency = "normal"
    reason = "Stable network and perceptual quality"
    confidence = 0.7
    model_version = "xgb-fl-v1" if lstm_available else "fl-heuristic-v1"

    throughput_risk = 0.0
    if lstm_available:
        if predicted_throughput <= 500:
            throughput_risk = 1.0
        elif predicted_throughput <= 1200:
            throughput_risk = 0.82
        elif predicted_throughput <= 2500:
            throughput_risk = 0.64
        elif predicted_throughput <= 5000:
            throughput_risk = 0.42
        else:
            throughput_risk = 0.12

    buffer_risk = 1.0 if buffer_ms < 500 else 0.82 if buffer_ms < 1500 else 0.45 if buffer_ms < 3000 else 0.12
    jitter_risk = 1.0 if jitter > 120 else 0.72 if jitter > 80 else 0.4 if jitter > 30 else 0.08
    loss_risk = 1.0 if packet_loss > 5 else 0.65 if packet_loss > 3 else 0.3 if packet_loss > 1 else 0.05
    qoe_risk = 0.88 if qoe < 40 else 0.65 if qoe < 55 else 0.3 if qoe < 70 else 0.08
    vmaf_risk = 0.78 if vmaf < 55 else 0.5 if vmaf < 70 else 0.18

    congestion_probability = max(
        0.0,
        min(
            1.0,
            round(
                (
                    buffer_risk * 0.32
                    + jitter_risk * 0.18
                    + loss_risk * 0.12
                    + qoe_risk * 0.16
                    + vmaf_risk * 0.07
                    + throughput_risk * 0.15
                ),
                3,
            ),
        ),
    )


    # ── 6-State Context-Aware Decision Logic ───────────────────

    # State 1: Emergency — imminent rebuffer
    if buffer_ms < 500 or (lstm_available and predicted_throughput < 500):
        decision = "reduce_bitrate"
        target_resolution = 240
        congestion_probability = max(congestion_probability, 0.92)
        recommended_action = "switch_to_cached"
        prefetch_seconds = 30
        urgency = "critical"
        reason = "Emergency: buffer critical or predicted throughput collapse"
        confidence = 0.95

    # State 2: Degraded — poor conditions
    elif (buffer_ms < buffer_threshold_low or jitter > jitter_threshold_high
          or packet_loss > 3 or qoe < qoe_threshold_low or vmaf < 65):
        decision = "reduce_bitrate"
        target_resolution = 360 if (vmaf < 60 or qoe < 45 or congestion_probability > 0.75) else 480
        congestion_probability = max(congestion_probability, 0.68)
        recommended_action = "prefetch_low_quality"
        prefetch_seconds = 20
        urgency = "warning"
        reason = "Degraded network: FL-tuned thresholds triggered"
        confidence = 0.84 + (0.06 if lstm_available else 0)

    # State 3: Recovery — improving from degraded
    elif (buffer_ms > 3000 and buffer_ms < buffer_threshold_high
          and jitter < jitter_threshold_high and qoe > qoe_threshold_low):
        if lstm_available and predicted_throughput > 5000:
            decision = "increase_resolution"
            target_resolution = 720
            recommended_action = "upgrade"
            prefetch_seconds = 12
            urgency = "normal"
            reason = "Recovery: LSTM predicts improving throughput"
            confidence = 0.76
        else:
            decision = "maintain"
            recommended_action = "normal"
            prefetch_seconds = 12
            urgency = "normal"
            reason = "Recovery phase: holding current quality"
            confidence = 0.72

    # State 4: Stable HD — conditions support upgrade
    elif (buffer_ms > buffer_threshold_high and jitter < jitter_threshold_low
          and packet_loss < 1 and qoe > qoe_threshold_high and vmaf > 85):
        decision = "increase_resolution"
        target_resolution = 1080
        congestion_probability = min(congestion_probability, 0.2)
        recommended_action = "upgrade"
        prefetch_seconds = 10
        urgency = "normal"
        reason = "HD-Stable: headroom with strong QoE and FL confidence"
        confidence = 0.82 + (0.08 if lstm_available else 0)

    # State 5: Low-latency — LSTM predicts very high throughput
    elif lstm_available and predicted_throughput > 50000 and jitter < 10:
        decision = "increase_resolution"
        target_resolution = 1080
        congestion_probability = min(congestion_probability, 0.12)
        recommended_action = "upgrade"
        prefetch_seconds = 10
        urgency = "normal"
        reason = "Low-latency: LSTM predicts >50Mbps with minimal jitter"
        confidence = 0.88

    # State 6: Warm-up / Default — maintain
    else:
        decision = "maintain"
        recommended_action = "normal"
        prefetch_seconds = 10
        urgency = "normal"
        reason = "Warm-up or stable conditions"
        confidence = 0.7

    target_bitrate = int(bitrate * 0.75) if bitrate > 0 and decision == "reduce_bitrate" else None
    latency = int((datetime.utcnow() - start).total_seconds() * 1000)
    return AdaptationDecisionResponse(
        sessionId=session_id,
        decision=decision,
        target_resolution=target_resolution,
        target_bitrate=target_bitrate,
        target_codec=None,
        congestion_probability=congestion_probability,
        recommended_action=recommended_action,
        prefetch_seconds=prefetch_seconds,
        urgency=urgency,
        reason=reason,
        confidence=confidence,
        ts=int(datetime.utcnow().timestamp() * 1000),
        model_version=model_version,
        inference_latency_ms=max(latency, 1),
    )


def _get_session_features(session_id: str) -> dict:
    database = get_db()
    telemetry = database["telemetry_data"].find_one(
        {"sessionId": session_id},
        sort=[("ts", -1)],
        projection={"_id": 0, "metrics": 1},
    )
    qoe = database["qoe_scores"].find_one(
        {"sessionId": session_id},
        sort=[("ts", -1)],
        projection={"_id": 0, "qoe": 1},
    )
    vmaf = database["vmaf_scores"].find_one(
        {"sessionId": session_id},
        sort=[("ts", -1)],
        projection={"_id": 0, "vmaf_score": 1},
    )

    metrics = telemetry.get("metrics", {}) if telemetry else {}
    return {
        **metrics,
        "qoe": qoe.get("qoe") if qoe else None,
        "vmaf_score": vmaf.get("vmaf_score") if vmaf else None,
    }


def _hash_proof(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


# ── Routes ────────────────────────────────────────────────────


@app.get("/health")
async def health():
    try:
        database = get_db()
        vmaf_count = database["vmaf_scores"].count_documents({})
        return VMAFHealthResponse(
            status="ok",
            mongo_connected=True,
            vmaf_collection_count=vmaf_count,
        )
    except Exception as e:
        return VMAFHealthResponse(
            status=f"error: {str(e)}",
            mongo_connected=False,
            vmaf_collection_count=0,
        )


@app.get("/health/webrtc")
async def webrtc_health():
    try:
        topic_health = getattr(app.state, "webrtc_topic_health", {})
        async_database = getattr(app.state, "mongo_async_db", None)
        session_collection_count = 0
        if async_database is not None:
            session_collection_count = await async_database["webrtc_sessions"].count_documents({})

        return {
            "status": "ok",
            "consumer_running": bool(getattr(app.state, "webrtc_consumer_task", None)),
            "topics": topic_health,
            "session_collection_count": session_collection_count,
        }
    except Exception as exc:
        return {
            "status": f"error: {exc}",
            "consumer_running": False,
            "topics": {},
            "session_collection_count": 0,
        }


@app.get("/metrics")
async def metrics() -> Response:
    payload, content_type = render_metrics()
    return Response(content=payload, media_type=content_type)


@app.post("/adaptation/decision/compute/{session_id}")
async def compute_adaptation_decision(session_id: str):
    """
    Build a decision from persisted telemetry/QoE/VMAF features,
    persist it, and push to Producer so SDK polling gets a fresh decision.
    """
    database = get_db()
    features = _get_session_features(session_id)
    decision = _build_decision_from_features(session_id, features).model_dump()

    # Insert a copy so insert_one's _id mutation doesn't leak into the response
    database["adaptation_decisions"].insert_one({**decision})
    pushed = _publish_decision_to_producer(session_id, decision)

    return {
        "success": True,
        "decision": decision,
        "published_to_producer": pushed,
        "features_used": features,
    }


@app.get("/adaptation/decisions")
async def list_adaptation_decisions(limit: int = Query(100, ge=1, le=1000)):
    database = get_db()
    docs = list(
        database["adaptation_decisions"]
        .find({}, {"_id": 0})
        .sort("ts", -1)
        .limit(limit)
    )
    return {"success": True, "data": docs, "count": len(docs)}


@app.get("/adaptation/feedback")
async def list_adaptation_feedback(limit: int = Query(100, ge=1, le=1000)):
    database = get_db()
    docs = list(
        database["adaptation_feedback"]
        .find({}, {"_id": 0})
        .sort("ts", -1)
        .limit(limit)
    )
    return {"success": True, "data": docs, "count": len(docs)}


@app.post("/federated/update")
async def submit_federated_update(payload: FederatedUpdatePayload):
    """
    Accept local model updates from SDK clients and aggregate with FedAvg-style mean.
    """
    database = get_db()
    doc = payload.model_dump()
    doc["ts"] = doc.get("ts") or int(datetime.utcnow().timestamp() * 1000)
    database["federated_updates"].insert_one({**doc})

    latest_model = database["federated_models"].find_one(sort=[("updated_at", -1)])
    current_weights = latest_model.get("global_weights", {}) if latest_model else {}

    merged = dict(current_weights)
    for k, v in payload.update.items():
        curr = _num(current_weights.get(k), 0)
        merged[k] = round((curr + _num(v)) / 2.0, 6)

    total_updates = database["federated_updates"].count_documents({})
    model_version = f"fl-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    model_doc = {
        "model_id": str(uuid.uuid4()),
        "model_version": model_version,
        "global_weights": merged,
        "total_updates": total_updates,
        "updated_at": datetime.utcnow().isoformat(),
    }
    database["federated_models"].insert_one({**model_doc})

    return {"success": True, "model": model_doc}


@app.get("/federated/model", response_model=FederatedModelResponse)
async def get_latest_federated_model():
    database = get_db()
    model = database["federated_models"].find_one(sort=[("updated_at", -1)], projection={"_id": 0})
    if not model:
        # bootstrap model
        model = {
            "model_id": str(uuid.uuid4()),
            "model_version": "fl-bootstrap",
            "global_weights": {"buffer_weight": 0.4, "jitter_weight": 0.3, "qoe_weight": 0.3},
            "total_updates": 0,
            "updated_at": datetime.utcnow().isoformat(),
        }
        database["federated_models"].insert_one({**model})
    return model


@app.post("/zk/proof/generate")
async def generate_zk_proof(payload: ZKProofPayload):
    """
    Demo-safe proof lifecycle using deterministic commitment hash.
    This is a placeholder for a real SNARK prover integration.
    """
    database = get_db()
    base_payload = {
        "session_id": payload.session_id,
        "qoe_score": payload.qoe_score,
        "ts": payload.ts,
        "metadata": payload.metadata or {},
    }
    proof_hash = _hash_proof(base_payload)
    proof_doc = {
        "proof_id": str(uuid.uuid4()),
        "proof_hash": proof_hash,
        "session_hash": _hash_proof({"session_id": payload.session_id}),
        "algorithm": "sha256-commitment-demo",
        "created_at": datetime.utcnow().isoformat(),
        **base_payload,
    }
    # Insert copies so ObjectId doesn't mutate the response dicts
    database["zk_proofs"].insert_one({**proof_doc})
    database["zk_audit_logs"].insert_one({
        "action": "generate",
        "proof_id": proof_doc["proof_id"],
        "ts": int(datetime.utcnow().timestamp() * 1000),
    })
    return {"success": True, "proof": proof_doc}


@app.post("/zk/proof/verify")
async def verify_zk_proof(payload: ZKProofPayload):
    database = get_db()
    expected = _hash_proof(
        {
            "session_id": payload.session_id,
            "qoe_score": payload.qoe_score,
            "ts": payload.ts,
            "metadata": payload.metadata or {},
        }
    )
    proof = database["zk_proofs"].find_one({"proof_hash": expected}, projection={"_id": 0})
    ok = proof is not None
    database["zk_audit_logs"].insert_one({
        "action": "verify",
        "proof_hash": expected,
        "verified": ok,
        "ts": int(datetime.utcnow().timestamp() * 1000),
    })
    return {"success": True, "verified": ok, "proof": proof}


@app.get("/zk/proofs")
async def list_zk_proofs(limit: int = Query(100, ge=1, le=1000)):
    database = get_db()
    proofs = list(database["zk_proofs"].find({}, {"_id": 0}).sort("created_at", -1).limit(limit))
    audits = list(database["zk_audit_logs"].find({}, {"_id": 0}).sort("ts", -1).limit(limit))
    return {
        "success": True,
        "proofs": proofs,
        "audit_logs": audits,
        "proof_count": len(proofs),
    }


@app.get("/vmaf/summary")
async def vmaf_summary(
    hours: int = Query(24, description="Look-back window in hours"),
    resolution: Optional[str] = Query(None, description="Filter by resolution (e.g., 720p)"),
):
    """
    Aggregated VMAF summary with quality distribution and time-series trend.
    Used by the dashboard VMAF panel.
    """
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    match_filter: dict = {"ts": {"$gte": cutoff}, "vmaf_score": {"$gte": 0}}
    if resolution:
        match_filter["resolution"] = resolution

    database = get_db()
    docs = list(database["vmaf_scores"].find(match_filter).sort("ts", 1))

    if not docs:
        return VMAFSummary(
            total_scores=0,
            avg_vmaf=0,
            min_vmaf=0,
            max_vmaf=0,
            median_vmaf=0,
            scores_by_resolution={},
            quality_distribution={"excellent": 0, "good": 0, "fair": 0, "poor": 0},
            trend=[],
        )

    scores = [d.get("vmaf_score", 0) for d in docs if d.get("vmaf_score", -1) >= 0]
    scores_sorted = sorted(scores)
    n = len(scores_sorted)

    # Per-resolution breakdown
    res_map: dict = {}
    for d in docs:
        r = d.get("resolution", "unknown")
        if r not in res_map:
            res_map[r] = []
        if d.get("vmaf_score", -1) >= 0:
            res_map[r].append(d["vmaf_score"])

    scores_by_resolution = {}
    for r, vals in res_map.items():
        scores_by_resolution[r] = {
            "avg": round(sum(vals) / len(vals), 2) if vals else 0,
            "min": round(min(vals), 2) if vals else 0,
            "max": round(max(vals), 2) if vals else 0,
            "count": len(vals),
        }

    # Quality distribution
    dist = {"excellent": 0, "good": 0, "fair": 0, "poor": 0}
    for s in scores:
        dist[classify_vmaf(s)] += 1

    # Time-series trend (group by hour)
    trend: list = []
    hour_map: dict = {}
    for d in docs:
        ts = d.get("ts")
        if isinstance(ts, datetime):
            hour_key = ts.strftime("%Y-%m-%d %H:00")
        else:
            hour_key = "unknown"
        if hour_key not in hour_map:
            hour_map[hour_key] = []
        if d.get("vmaf_score", -1) >= 0:
            hour_map[hour_key].append(d["vmaf_score"])

    for hour_key, vals in hour_map.items():
        trend.append(
            {
                "time": hour_key,
                "avg_vmaf": round(sum(vals) / len(vals), 2) if vals else 0,
                "count": len(vals),
                "min": round(min(vals), 2) if vals else 0,
                "max": round(max(vals), 2) if vals else 0,
            }
        )

    return VMAFSummary(
        total_scores=n,
        avg_vmaf=round(sum(scores) / n, 2),
        min_vmaf=round(scores_sorted[0], 2),
        max_vmaf=round(scores_sorted[-1], 2),
        median_vmaf=round(scores_sorted[n // 2], 2),
        scores_by_resolution=scores_by_resolution,
        quality_distribution=dist,
        trend=trend,
    )


@app.get("/vmaf/scores")
async def vmaf_scores(
    session_id: Optional[str] = Query(None, description="Filter by session ID"),
    resolution: Optional[str] = Query(None, description="Filter by resolution"),
    limit: int = Query(50, ge=1, le=500),
):
    """Raw VMAF scores list, newest first. Used for detailed drill-down."""
    match_filter: dict = {}
    if session_id:
        match_filter["sessionId"] = session_id
    if resolution:
        match_filter["resolution"] = resolution

    database = get_db()
    docs = list(
        database["vmaf_scores"]
        .find(match_filter, {"_id": 0})
        .sort("ts", -1)
        .limit(limit)
    )

    # Convert datetime objects to ISO strings for JSON serialization
    for d in docs:
        if isinstance(d.get("ts"), datetime):
            d["ts"] = d["ts"].isoformat()

    return {"success": True, "data": docs, "count": len(docs)}


@app.get("/vmaf/distribution")
async def vmaf_distribution(hours: int = Query(24)):
    """
    VMAF score distribution in buckets (0-10, 10-20, ..., 90-100).
    Similar to the QoE distribution chart but for perceptual quality.
    """
    cutoff = datetime.utcnow() - timedelta(hours=hours)

    pipeline = [
        {"$match": {"ts": {"$gte": cutoff}, "vmaf_score": {"$gte": 0}}},
        {
            "$bucket": {
                "groupBy": "$vmaf_score",
                "boundaries": [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
                "default": "100",
                "output": {"count": {"$sum": 1}, "avg": {"$avg": "$vmaf_score"}},
            }
        },
    ]

    try:
        database = get_db()
        results = list(database["vmaf_scores"].aggregate(pipeline))
        chart_data = []
        for r in results:
            bucket_id = r["_id"]
            if bucket_id == "100":
                label = "90-100"
            else:
                label = f"{bucket_id}-{bucket_id + 10}"
            chart_data.append(
                {
                    "range": label,
                    "count": r["count"],
                    "avg_vmaf": round(r["avg"], 2),
                }
            )
        return {"success": True, "data": chart_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/qoe/enhanced")
async def qoe_enhanced(hours: int = Query(24)):
    """
    Enhanced QoE data that includes VMAF scores alongside traditional metrics.
    Joins qoe_scores with vmaf_scores by sessionId.
    """
    cutoff = datetime.utcnow() - timedelta(hours=hours)

    database = get_db()
    qoe_docs = list(
        database["qoe_scores"]
        .find({"ts": {"$gte": cutoff}}, {"_id": 0})
        .sort("ts", -1)
        .limit(100)
    )

    # Enrich with VMAF data
    session_ids = [d.get("sessionId") for d in qoe_docs if d.get("sessionId")]
    vmaf_docs = list(
        database["vmaf_scores"].find(
            {"sessionId": {"$in": session_ids}, "vmaf_score": {"$gte": 0}}, {"_id": 0}
        )
    )

    # Group VMAF by session
    vmaf_by_session: dict = {}
    for v in vmaf_docs:
        sid = v.get("sessionId")
        if sid not in vmaf_by_session:
            vmaf_by_session[sid] = []
        vmaf_by_session[sid].append(v)

    # Merge
    enriched = []
    for qoe in qoe_docs:
        sid = qoe.get("sessionId")
        vmaf_data = vmaf_by_session.get(sid, [])
        avg_vmaf = (
            round(sum(v["vmaf_score"] for v in vmaf_data) / len(vmaf_data), 2)
            if vmaf_data
            else None
        )

        if isinstance(qoe.get("ts"), datetime):
            qoe["ts"] = qoe["ts"].isoformat()

        enriched.append(
            {
                **qoe,
                "vmaf_avg": avg_vmaf,
                "vmaf_count": len(vmaf_data),
                "vmaf_scores": [
                    {"resolution": v.get("resolution"), "score": v.get("vmaf_score")}
                    for v in vmaf_data
                ],
                "quality_category": classify_vmaf(avg_vmaf) if avg_vmaf else "unknown",
            }
        )

    return {"success": True, "data": enriched, "count": len(enriched)}


# ── Entry Point ───────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=True)
