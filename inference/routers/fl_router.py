from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from inference.fl.server import DEFAULT_WEBRTC_WEIGHTS, FLServer


router = APIRouter(prefix="/fl", tags=["Federated Learning"])


def get_async_db(request: Request) -> AsyncIOMotorDatabase:
    database = getattr(request.app.state, "mongo_async_db", None)
    if database is None:
        raise HTTPException(status_code=503, detail="Async database not ready.")
    return database


def get_fl_server(request: Request) -> FLServer:
    fl_server = getattr(request.app.state, "webrtc_fl_server", None)
    if fl_server is None:
        raise HTTPException(status_code=503, detail="WebRTC FL server not ready.")
    return fl_server


class WebRTCFLUpdateRequest(BaseModel):
    session_id: str = Field(min_length=1)
    participant_id: str = Field(min_length=1)
    gradient_update: list[float] = Field(min_length=5, max_length=5)


class WebRTCFLUpdateResponse(BaseModel):
    accepted: bool
    current_global_weights: list[float]


class WebRTCFLWeightsResponse(BaseModel):
    weights: list[float]
    round_number: int
    model_type: str


@router.post("/webrtc/update", response_model=WebRTCFLUpdateResponse)
async def submit_webrtc_fl_update(
    payload: WebRTCFLUpdateRequest,
    database: AsyncIOMotorDatabase = Depends(get_async_db),
    fl_server: FLServer = Depends(get_fl_server),
) -> WebRTCFLUpdateResponse:
    gradient = np.asarray(payload.gradient_update, dtype=np.float32)
    if gradient.shape != (5,):
        raise HTTPException(status_code=400, detail="gradient_update must contain exactly 5 values.")

    await database["webrtc_fl_updates"].insert_one(
        {
            "session_id": payload.session_id,
            "participant_id": payload.participant_id,
            "gradient_update": gradient.astype(float).tolist(),
            "timestamp": datetime.now(tz=UTC),
        }
    )

    current_weights, _ = await fl_server.get_current_global_weights()
    return WebRTCFLUpdateResponse(
        accepted=True,
        current_global_weights=current_weights.astype(float).tolist(),
    )


@router.get("/webrtc/weights", response_model=WebRTCFLWeightsResponse)
async def get_webrtc_fl_weights(
    fl_server: FLServer = Depends(get_fl_server),
) -> WebRTCFLWeightsResponse:
    weights, round_number = await fl_server.get_current_global_weights()
    if weights.size == 0:
        weights = DEFAULT_WEBRTC_WEIGHTS.copy()
    return WebRTCFLWeightsResponse(
        weights=weights.astype(float).tolist(),
        round_number=round_number,
        model_type="webrtc_qoe",
    )
