"""
inference/bridge.py
FastAPI FL bridge — replaces Flower gRPC for Expo Managed Workflow.
Preserves FedAvg semantics: round-based, per-client weight exchange.

Endpoints:
  GET  /fl/health           — FL server status
  GET  /fl/global-weights   — broadcast current global model
  POST /fl/submit-weights   — receive client weight update
  GET  /fl/round-metrics    — all fl_rounds from Atlas
  GET  /fl/current-round    — real-time round state
  POST /fl/telemetry        — SDK writes streaming metrics (replaces Atlas Data API)
  GET  /fl/training-data    — SDK fetches training data by session_id

Mounted on the existing app.py FastAPI server under /fl prefix
to share port 8000 with existing VMAF/adaptation endpoints.
"""

import os
from datetime import datetime
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, BackgroundTasks, Query
from pydantic import BaseModel
import numpy as np
from dotenv import load_dotenv

load_dotenv()

from inference.fl.aggregator import fedavg, make_initial_weights
from inference.metrics import compute_and_save
from inference.mongo_reader import get_all_round_metrics, get_client

DB_NAME = os.getenv("MONGO_DB", os.getenv("DB_NAME", "test"))
COL_LOGS = os.getenv("COLLECTION_LOGS", "streaming_logs")

# ── Router (mounted by app.py as sub-router) ──────────────────
router = APIRouter(prefix="/fl", tags=["Federated Learning"])

# ── Global FL state ────────────────────────────────────────────
device_weights: Dict[str, List] = {}
device_meta: Dict[str, Any] = {}
global_weights: Optional[List] = None
current_round: int = 0
training_active: bool = False
MIN_CLIENTS = int(os.getenv("MIN_CLIENTS", 2))


# ── Pydantic request schema ──────────────────────────────────
class WeightPayload(BaseModel):
    session_id: str  # MUST be session_id not device_id
    round_num: int
    weights: List[List[float]]  # 8 tensors matching WEIGHT_SHAPES
    num_samples: int
    train_loss: float


class GlobalWeightResponse(BaseModel):
    round_num: int
    weights: List[List[float]]
    config: Dict[str, Any]


# ── Endpoints ────────────────────────────────────────────────
@router.get("/health")
def fl_health():
    return {
        "status": "running",
        "current_round": current_round,
        "devices_ready": len(device_weights),
        "min_clients": MIN_CLIENTS,
        "training_active": training_active,
    }


@router.get("/global-weights", response_model=GlobalWeightResponse)
def get_global_weights():
    """
    Called by Expo client at start of each FL round.
    Returns current global model + training config for that round.
    LR decays after round 5 (warm-up complete).
    """
    global global_weights
    if global_weights is None:
        global_weights = make_initial_weights()
    lr = 0.001 if current_round <= 5 else 0.0005
    return GlobalWeightResponse(
        round_num=current_round,
        weights=global_weights,
        config={"lr": lr, "epochs": 3, "batch_size": 16},
    )


@router.post("/submit-weights")
async def submit_weights(payload: WeightPayload, bg: BackgroundTasks):
    """
    Called by Expo client after local training.
    Payload contains updated weights after local training.
    Triggers FedAvg aggregation when MIN_CLIENTS have submitted.
    """
    global training_active

    # Stale-round guard (Section 7)
    if payload.round_num < current_round:
        print(
            f"[Bridge] Stale round {payload.round_num} from {payload.session_id}"
        )
        return {"status": "rejected", "reason": "stale_round"}

    device_weights[payload.session_id] = payload.weights
    device_meta[payload.session_id] = {
        "num_samples": payload.num_samples,
        "train_loss": payload.train_loss,
        "round": payload.round_num,
    }

    print(
        f"[Bridge] session={payload.session_id[-8:]} "
        f"round={payload.round_num} "
        f"loss={payload.train_loss:.4f} "
        f"n={payload.num_samples} "
        f"({len(device_weights)}/{MIN_CLIENTS} ready)"
    )

    if len(device_weights) >= MIN_CLIENTS and not training_active:
        training_active = True
        bg.add_task(_aggregate)

    return {
        "status": "received",
        "devices_ready": len(device_weights),
        "aggregating": len(device_weights) >= MIN_CLIENTS,
    }


@router.get("/round-metrics")
def round_metrics():
    """Returns all fl_rounds records from Atlas for dashboard.py."""
    return get_all_round_metrics()


@router.get("/current-round")
def current_round_info():
    return {
        "round": current_round,
        "devices": list(device_weights.keys()),
    }


# ── Telemetry proxy (replaces deprecated Atlas Data API) ──────
# SDK writes/reads streaming metrics through these endpoints
# instead of calling the Atlas Data API directly.


class TelemetryDoc(BaseModel):
    session_id: str
    bitrate: float
    buffer_health: float  # buffer_health NOT buffer_ratio
    latency: float
    rebuffering: float = 0.0
    qoe_score: float
    mode: str = "simulated"


@router.post("/telemetry")
def ingest_telemetry(doc: TelemetryDoc):
    """
    SDK writes streaming metrics here (replaces Atlas Data API).
    Stores to Atlas streaming_logs via pymongo.
    """
    db = get_client()[DB_NAME]
    record = doc.model_dump()
    record["timestamp"] = datetime.utcnow().isoformat()
    db[COL_LOGS].insert_one(record)
    return {"status": "ok", "inserted": 1}


@router.get("/training-data")
def get_training_data(
    session_id: str = Query("", description="Filter by session_id"),
    limit: int = Query(500, ge=1, le=2000),
):
    """
    SDK reads training data here (replaces Atlas Data API find).
    Returns streaming_logs filtered by session_id.
    """
    db = get_client()[DB_NAME]
    query = {"session_id": session_id} if session_id else {}
    docs = list(
        db[COL_LOGS]
        .find(query, {"_id": 0})
        .sort("timestamp", -1)
        .limit(limit)
    )
    return {"documents": docs, "count": len(docs)}


# ── FedAvg aggregation (background task) ──────────────────────
async def _aggregate():
    global global_weights, current_round
    global device_weights, device_meta, training_active

    print(
        f"\n[Bridge] Aggregating round {current_round + 1} "
        f"from {len(device_weights)} clients..."
    )

    agg = fedavg(device_weights, device_meta)
    global_weights = [layer.tolist() for layer in agg]
    current_round += 1

    print(f"[Bridge] FedAvg done → round {current_round}")

    # Server-side eval against Atlas streaming_logs
    compute_and_save(agg, current_round)

    # Reset for next round — weights cleared from memory (never stored to disk)
    device_weights = {}
    device_meta = {}
    training_active = False
    print(f"[Bridge] Ready for round {current_round + 1}")
