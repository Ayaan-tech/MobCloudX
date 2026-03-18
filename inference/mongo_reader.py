"""
inference/mongo_reader.py
MongoDB Atlas reader for MobCloudX FL pipeline.

Reads streaming_logs from Atlas, applies FIELD_MAP to normalise
field names, and computes QoE labels.

CRITICAL: buffer_health is the Atlas field (NOT buffer_ratio)
CRITICAL: session_id is the device identifier (NOT device_id)
"""

import os
from pymongo import MongoClient
import pandas as pd
import numpy as np
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("MONGO_DB", os.getenv("DB_NAME", "test"))
COL_LOGS = os.getenv("COLLECTION_LOGS", "streaming_logs")
COL_ROUNDS = os.getenv("COLLECTION_ROUNDS", "fl_rounds")

# ── Pre-filled confirmed Atlas field names ────────────────────
# buffer_health = your Atlas field (mapped to buffer_ratio internally
#                 for backward compat with existing compute_qoe logic)
# session_id    = your device identifier (NOT device_id)
FIELD_MAP = {
    "bitrate": "bitrate",
    "buffer_health": "buffer_ratio",  # Atlas field → internal name
    "latency": "latency",
    # rebuffering → add if field exists in Atlas
}
FEATURE_COLS = ["bitrate", "buffer_ratio", "latency", "rebuffering", "bitrate_switch"]
# ─────────────────────────────────────────────────────────────

_client = None


def get_client():
    global _client
    if _client is None:
        if not MONGO_URI:
            raise RuntimeError("MONGO_URI environment variable is required but not set.")
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    return _client


def compute_qoe(df: pd.DataFrame) -> pd.DataFrame:
    """
    ITU-T P.1203 inspired QoE formula.
    Uses buffer_ratio (mapped from buffer_health in Atlas).
    MUST match TypeScript computeQoE() in MetricSimulator.ts exactly.

    Validation:
      computeQoE(3.52, 0.71, 58, 0) ≈ 0.763
      computeQoE(0.3, 0.0, 350, 1) ≈ 0.0 (clamped poor)
      computeQoE(18, 1.0, 5, 0)    ≈ 1.0 (clamped excellent)
    """
    df["qoe_score"] = np.clip(
        0.4 * np.clip(df["bitrate"] / 6.0, 0, 1)
        + 0.3 * (1 - np.clip(df.get("buffer_ratio", pd.Series(0, index=df.index)), 0, 1))
        + 0.2 * (1 - np.clip(df["latency"] / 200.0, 0, 1))
        + 0.1 * (1 - np.clip(df.get("rebuffering", pd.Series(0, index=df.index)), 0, 1)),
        0,
        1,
    )
    return df


def fetch_for_eval(session_id: str = None, limit: int = 2000) -> pd.DataFrame:
    """Fetch streaming_logs from Atlas and prepare for model evaluation."""
    db = get_client()[DB_NAME]
    query = {"session_id": session_id} if session_id else {}
    docs = list(db[COL_LOGS].find(query, {"_id": 0}).limit(limit))
    if not docs:
        raise ValueError(f"No documents found. Query: {query}")
    df = pd.DataFrame(docs).rename(columns=FIELD_MAP)
    if "bitrate_switch" not in df.columns:
        df["bitrate_switch"] = df["bitrate"].diff().abs().fillna(0)
    if "rebuffering" not in df.columns:
        df["rebuffering"] = 0.0
    if "buffer_ratio" not in df.columns and "buffer_health" in df.columns:
        df["buffer_ratio"] = df["buffer_health"]
    if "buffer_ratio" not in df.columns:
        df["buffer_ratio"] = 0.0
    if "qoe_score" not in df.columns:
        df = compute_qoe(df)
    missing = [c for c in FEATURE_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing after FIELD_MAP: {missing}")
    return df[FEATURE_COLS + ["qoe_score"]].dropna()


def save_round_metrics(round_num: int, metrics: dict):
    """Save FL round metrics to Atlas fl_rounds collection."""
    db = get_client()[DB_NAME]
    db[COL_ROUNDS].update_one(
        {"round": round_num}, {"$set": metrics}, upsert=True
    )
    print(f"[MongoDB] Round {round_num} saved to Atlas fl_rounds")


def get_all_round_metrics() -> list:
    """Fetch all FL round metrics from Atlas, ordered by round."""
    db = get_client()[DB_NAME]
    return list(db[COL_ROUNDS].find({}, {"_id": 0}).sort("round", 1))
