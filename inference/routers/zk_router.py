from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from inference.routers.webrtc_router import get_async_db
from inference.services.webrtc_qoe_service import WebRTCQoEService
from inference.services.zk_proof_service import SessionProofPayload, ZKProofService

router = APIRouter(prefix="/zk", tags=["ZK"])


class ZKGenerateProofRequest(BaseModel):
    session_id: str = Field(min_length=1)
    qoe_start: float | None = None
    qoe_minimum: float | None = None
    qoe_recovery: float | None = None
    stall_count: int | None = None
    session_duration: int | None = None
    sla_threshold: float | None = None
    max_stalls: int | None = None
    metadata: dict[str, Any] | None = None


class ZKVerifyProofRequest(BaseModel):
    session_id: str = Field(min_length=1)


def _override_or_summary_payload(
    request_payload: ZKGenerateProofRequest,
    summary_payload: SessionProofPayload,
) -> SessionProofPayload:
    return SessionProofPayload(
        session_id=request_payload.session_id,
        qoe_start=request_payload.qoe_start if request_payload.qoe_start is not None else summary_payload.qoe_start,
        qoe_minimum=request_payload.qoe_minimum if request_payload.qoe_minimum is not None else summary_payload.qoe_minimum,
        qoe_recovery=request_payload.qoe_recovery if request_payload.qoe_recovery is not None else summary_payload.qoe_recovery,
        stall_count=request_payload.stall_count if request_payload.stall_count is not None else summary_payload.stall_count,
        session_duration=request_payload.session_duration if request_payload.session_duration is not None else summary_payload.session_duration,
        sla_threshold=request_payload.sla_threshold if request_payload.sla_threshold is not None else summary_payload.sla_threshold,
        max_stalls=request_payload.max_stalls if request_payload.max_stalls is not None else summary_payload.max_stalls,
        metadata=request_payload.metadata if request_payload.metadata is not None else summary_payload.metadata,
    )


@router.post("/generate-proof")
async def generate_proof(
    payload: ZKGenerateProofRequest,
    database: AsyncIOMotorDatabase = Depends(get_async_db),
) -> dict[str, Any]:
    qoe_service = WebRTCQoEService(database)
    summary = await qoe_service.compute_session_summary(payload.session_id)
    zk_service = ZKProofService(database)
    summary_payload = await zk_service.build_payload_from_session_summary(payload.session_id, summary)
    effective_payload = _override_or_summary_payload(payload, summary_payload)
    proof = await zk_service.generate_session_proof(effective_payload)
    return {"success": True, "proof": proof}


@router.post("/verify-proof")
async def verify_proof(
    payload: ZKVerifyProofRequest,
    database: AsyncIOMotorDatabase = Depends(get_async_db),
) -> dict[str, Any]:
    zk_service = ZKProofService(database)
    proof_doc = await zk_service.get_session_proof(payload.session_id)
    if proof_doc is None:
        raise HTTPException(status_code=404, detail="Proof not found for session.")

    qoe_service = WebRTCQoEService(database)
    summary = await qoe_service.compute_session_summary(payload.session_id)
    summary_payload = await zk_service.build_payload_from_session_summary(payload.session_id, summary)
    verification = await zk_service.verify_session_proof(summary_payload, proof_doc)
    return {"success": True, "proof": proof_doc, "verification": verification}


@router.get("/session/{session_id}")
async def get_session_proof(
    session_id: str,
    database: AsyncIOMotorDatabase = Depends(get_async_db),
) -> dict[str, Any]:
    zk_service = ZKProofService(database)
    proof_doc = await zk_service.get_session_proof(session_id)
    if proof_doc is None:
        raise HTTPException(status_code=404, detail="Proof not found for session.")
    return {"success": True, "proof": proof_doc}


@router.get("/session/{session_id}/ledger")
async def get_session_ledger(
    session_id: str,
    database: AsyncIOMotorDatabase = Depends(get_async_db),
) -> dict[str, Any]:
    zk_service = ZKProofService(database)
    proof_doc = await zk_service.get_session_proof(session_id)
    logs = await zk_service.get_session_audit_logs(session_id)
    if proof_doc is None and not logs:
        raise HTTPException(status_code=404, detail="Ledger not found for session.")
    return {
        "success": True,
        "proof": proof_doc,
        "entries": logs,
    }
