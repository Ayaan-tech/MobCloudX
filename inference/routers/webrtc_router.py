from __future__ import annotations

import os
import uuid
import jwt
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from inference.services.webrtc_qoe_service import QoETimelinePoint, WebRTCQoEService, WebRTCSessionSummary
from inference.services.zk_proof_service import ZKProofService

router = APIRouter(prefix="/webrtc", tags=["WebRTC"])


def get_async_db(request: Request) -> AsyncIOMotorDatabase:
    database = getattr(request.app.state, "mongo_async_db", None)
    if database is None:
        raise HTTPException(status_code=503, detail="Async database not ready.")
    return database


class StreamTokenRequest(BaseModel):
    user_id: str = Field(min_length=1)
    call_id: str | None = None
    device_info: dict[str, Any] | None = None


class StreamTokenResponse(BaseModel):
    token: str
    call_id: str
    session_id: str
    api_key: str
    user_id: str
    expires_at: int


class EndSessionRequest(BaseModel):
    session_id: str = Field(min_length=1)


class SessionSummaryResponse(BaseModel):
    session_id: str
    status: str
    qoe_summary: WebRTCSessionSummary
    zk_proof: dict[str, Any] | None = None


class ParticipantTimelineResponse(BaseModel):
    session_id: str
    participant_id: str
    timeline: list[QoETimelinePoint]


def _create_stream_video_token(user_id: str, expiration_seconds: int = 3600) -> str:
    """Create a Stream Video token using JWT."""
    api_key = os.getenv("STREAM_API_KEY", "")
    api_secret = os.getenv("STREAM_API_SECRET", "")
    if not api_key or not api_secret:
        raise HTTPException(status_code=500, detail="Stream API credentials are not configured.")
    
    # Token payload for Stream Video SDK
    now = int(datetime.now(tz=UTC).timestamp())
    payload = {
        "user_id": user_id,
        "iat": now,
        "exp": now + expiration_seconds,
    }
    
    # Encode JWT token
    token = jwt.encode(payload, api_secret, algorithm="HS256", headers={"typ": "JWT"})
    return token


@router.post("/session/token", response_model=StreamTokenResponse)
async def create_stream_token(
    payload: StreamTokenRequest,
    database: AsyncIOMotorDatabase = Depends(get_async_db),
) -> StreamTokenResponse:
    call_id = payload.call_id or str(uuid.uuid4())
    session_id = str(uuid.uuid4())
    expires_at = int((datetime.now(tz=UTC) + timedelta(hours=1)).timestamp())
    token = _create_stream_video_token(payload.user_id, expiration_seconds=3600)

    # Check if call_id already exists
    existing_session = await database["webrtc_sessions"].find_one({"call_id": call_id})
    
    if existing_session:
        # Update existing session with new participant
        await database["webrtc_sessions"].update_one(
            {"call_id": call_id},
            {
                "$addToSet": {"participants": payload.user_id},
                "$set": {"status": "active", "device_info": payload.device_info}
            }
        )
        session_id = existing_session["session_id"]
    else:
        # Create new session
        await database["webrtc_sessions"].insert_one(
            {
                "session_id": session_id,
                "call_id": call_id,
                "participants": [payload.user_id],
                "started_at": datetime.now(tz=UTC),
                "mode": "webrtc",
                "status": "initialising",
                "device_info": payload.device_info,
            }
        )

    return StreamTokenResponse(
        token=token,
        call_id=call_id,
        session_id=session_id,
        api_key=os.getenv("STREAM_API_KEY", ""),
        user_id=payload.user_id,
        expires_at=expires_at,
    )


@router.post("/session/end", response_model=SessionSummaryResponse)
async def end_webrtc_session(
    payload: EndSessionRequest,
    database: AsyncIOMotorDatabase = Depends(get_async_db),
) -> SessionSummaryResponse:
    session_doc = await database["webrtc_sessions"].find_one({"session_id": payload.session_id})
    if session_doc is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    qoe_service = WebRTCQoEService(database)
    qoe_summary = await qoe_service.compute_session_summary(payload.session_id)
    zk_service = ZKProofService(database)
    zk_payload = await zk_service.build_payload_from_session_summary(payload.session_id, qoe_summary)
    zk_proof = await zk_service.generate_session_proof(zk_payload)
    ended_at = datetime.now(tz=UTC)

    await database["webrtc_sessions"].update_one(
        {"session_id": payload.session_id},
        {
            "$set": {
                "ended_at": ended_at,
                "status": "completed",
                "qoe_summary": qoe_summary.model_dump(mode="json"),
                "zk_proof": zk_proof,
            }
        },
    )

    return SessionSummaryResponse(
        session_id=payload.session_id,
        status="completed",
        qoe_summary=qoe_summary,
        zk_proof=zk_proof,
    )


@router.get("/session/{session_id}/metrics")
async def get_session_metrics(
    session_id: str,
    database: AsyncIOMotorDatabase = Depends(get_async_db),
) -> dict[str, Any]:
    session_doc = await database["webrtc_sessions"].find_one({"session_id": session_id}, {"_id": 0})
    if session_doc is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    telemetry_docs = await database["webrtc_telemetry"].find(
        {"session_id": session_id},
        {"_id": 0},
    ).sort("timestamp", -1).to_list(length=5000)
    adaptation_docs = await database["webrtc_adaptations"].find(
        {"session_id": session_id},
        {"_id": 0},
    ).sort("timestamp", 1).to_list(length=2000)

    grouped: dict[str, list[dict[str, Any]]] = {}
    for document in telemetry_docs:
        participant_id = str(document.get("participant_id", "unknown"))
        grouped.setdefault(participant_id, [])
        if len(grouped[participant_id]) >= 300:
            continue
        timestamp = document.get("timestamp")
        grouped[participant_id].append(
            {
                **document,
                "timestamp": int(timestamp.timestamp() * 1000) if isinstance(timestamp, datetime) else timestamp,
            }
        )

    for participant_id, entries in grouped.items():
        grouped[participant_id] = list(reversed(entries))

    normalized_adaptations = [
        {
            **document,
            "timestamp": int(timestamp.timestamp() * 1000) if isinstance((timestamp := document.get("timestamp")), datetime) else timestamp,
        }
        for document in adaptation_docs
    ]

    return {
        "session_id": session_id,
        "call_id": session_doc.get("call_id"),
        "participants": grouped,
        "adaptations": normalized_adaptations,
    }


@router.get("/session/{session_id}/participant/{participant_id}/timeline", response_model=ParticipantTimelineResponse)
async def get_participant_timeline(
    session_id: str,
    participant_id: str,
    downsample_seconds: int = 5,
    database: AsyncIOMotorDatabase = Depends(get_async_db),
) -> ParticipantTimelineResponse:
    qoe_service = WebRTCQoEService(database)
    timeline = await qoe_service.get_participant_timeline(session_id, participant_id, downsample_seconds)
    return ParticipantTimelineResponse(session_id=session_id, participant_id=participant_id, timeline=timeline)


@router.get("/analytics/sr-effectiveness")
async def get_sr_effectiveness_analytics(
    database: AsyncIOMotorDatabase = Depends(get_async_db),
) -> dict[str, Any]:
    sr_sessions_pipeline = [
        {"$match": {"sr_active": True}},
        {"$group": {"_id": "$session_id"}},
        {"$count": "count"},
    ]
    sr_sessions_result = await database["webrtc_telemetry"].aggregate(sr_sessions_pipeline).to_list(length=1)
    sr_sessions_count = int(sr_sessions_result[0]["count"]) if sr_sessions_result else 0

    brisque_pipeline = [
        {"$match": {"brisque_score": {"$ne": None}}},
        {
            "$group": {
                "_id": {"session_id": "$session_id", "participant_id": "$participant_id"},
                "sr_on_avg": {
                    "$avg": {
                        "$cond": [{"$eq": ["$sr_active", True]}, "$brisque_score", None]
                    }
                },
                "sr_off_avg": {
                    "$avg": {
                        "$cond": [{"$eq": ["$sr_active", False]}, "$brisque_score", None]
                    }
                },
                "qoe_on_avg": {
                    "$avg": {
                        "$cond": [{"$eq": ["$sr_active", True]}, "$qoe_score", None]
                    }
                },
                "qoe_off_avg": {
                    "$avg": {
                        "$cond": [{"$eq": ["$sr_active", False]}, "$qoe_score", None]
                    }
                },
            }
        },
    ]
    brisque_groups = await database["webrtc_telemetry"].aggregate(brisque_pipeline).to_list(length=5000)
    brisque_improvements = [
        float(group["sr_on_avg"] - group["sr_off_avg"])
        for group in brisque_groups
        if group.get("sr_on_avg") is not None and group.get("sr_off_avg") is not None
    ]
    qoe_deltas = [
        float(group["qoe_on_avg"] - group["qoe_off_avg"])
        for group in brisque_groups
        if group.get("qoe_on_avg") is not None and group.get("qoe_off_avg") is not None
    ]

    device_tier_pipeline = [
        {
            "$lookup": {
                "from": "webrtc_sessions",
                "localField": "session_id",
                "foreignField": "session_id",
                "as": "session_doc",
            }
        },
        {"$unwind": "$session_doc"},
        {
            "$addFields": {
                "device_tier": {
                    "$switch": {
                        "branches": [
                            {
                                "case": {"$lt": ["$session_doc.device_info.ram_gb", 3]},
                                "then": "low",
                            },
                            {
                                "case": {"$lt": ["$session_doc.device_info.ram_gb", 6]},
                                "then": "mid",
                            },
                        ],
                        "default": "high",
                    }
                }
            }
        },
        {
            "$group": {
                "_id": "$device_tier",
                "total": {"$sum": 1},
                "sr_active_samples": {"$sum": {"$cond": ["$sr_active", 1, 0]}},
            }
        },
    ]
    tier_rows = await database["webrtc_telemetry"].aggregate(device_tier_pipeline).to_list(length=10)
    activation_rate_by_tier = {
        str(row["_id"]): float(row["sr_active_samples"]) / max(float(row["total"]), 1.0)
        for row in tier_rows
    }

    return {
        "sr_sessions_count": sr_sessions_count,
        "avg_brisque_improvement_when_sr_active": float(sum(brisque_improvements) / max(len(brisque_improvements), 1)),
        "sr_activation_rate_by_device_tier": activation_rate_by_tier,
        "avg_qoe_delta_sr_on_vs_off": float(sum(qoe_deltas) / max(len(qoe_deltas), 1)),
    }
