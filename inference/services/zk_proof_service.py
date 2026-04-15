from __future__ import annotations

import importlib.util
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase


@dataclass
class SessionProofPayload:
    session_id: str
    qoe_start: float
    qoe_minimum: float
    qoe_recovery: float
    stall_count: int
    session_duration: int
    sla_threshold: float
    max_stalls: int
    metadata: dict[str, Any]

    def to_circuit_input(self) -> dict[str, Any]:
        recovery_ok = int(round(self.qoe_recovery)) >= int(round(self.sla_threshold))
        stalls_ok = int(self.stall_count) <= int(self.max_stalls)
        duration_ok = int(self.session_duration) >= 10
        return {
            "qoe_start": int(round(self.qoe_start)),
            "qoe_minimum": int(round(self.qoe_minimum)),
            "qoe_recovery": int(round(self.qoe_recovery)),
            "stall_count": int(self.stall_count),
            "session_duration": int(self.session_duration),
            "sla_threshold": int(round(self.sla_threshold)),
            "max_stalls": int(self.max_stalls),
            "recovery_ok_input": 1 if recovery_ok else 0,
            "stalls_ok_input": 1 if stalls_ok else 0,
            "duration_ok_input": 1 if duration_ok else 0,
        }


class ZKProofService:
    def __init__(self, database: AsyncIOMotorDatabase) -> None:
        self.database = database
        root_dir = Path(__file__).resolve().parents[2]
        proof_script = root_dir / "zk" / "proof_generator.py"
        spec = importlib.util.spec_from_file_location("mobcloudx_zk_proof_generator", proof_script)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Unable to load proof generator from {proof_script}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.generator = module
        self.sla_threshold = float(os.getenv("ZK_SLA_THRESHOLD", os.getenv("WEBRTC_QOE_SLA_THRESHOLD", "60")))
        self.max_stalls = int(os.getenv("ZK_MAX_STALLS", "0"))

    async def build_payload_from_session_summary(self, session_id: str, summary: Any) -> SessionProofPayload:
        timeline = list(getattr(summary, "qoe_timeline", []) or [])
        qoe_values = [float(point.qoe_score) for point in timeline]

        telemetry_docs = await self.database["webrtc_telemetry"].find(
            {"session_id": session_id},
            {
                "_id": 0,
                "timestamp": 1,
                "freezeCount": 1,
                "freeze_count": 1,
            },
        ).sort("timestamp", 1).to_list(length=None)

        first_ts = telemetry_docs[0].get("timestamp") if telemetry_docs else None
        last_ts = telemetry_docs[-1].get("timestamp") if telemetry_docs else None

        if isinstance(first_ts, datetime) and isinstance(last_ts, datetime):
            session_duration = max(0, int((last_ts - first_ts).total_seconds()))
        else:
            session_duration = max(len(qoe_values) * 5, 0)

        freeze_samples = [
            int(doc.get("freezeCount") or doc.get("freeze_count") or 0)
            for doc in telemetry_docs
        ]
        stall_count = max(freeze_samples, default=0)

        qoe_start = qoe_values[0] if qoe_values else float(getattr(summary, "avg_qoe", 0))
        qoe_minimum = min(qoe_values) if qoe_values else float(getattr(summary, "avg_qoe", 0))
        qoe_recovery = qoe_values[-1] if qoe_values else float(getattr(summary, "avg_qoe", 0))

        metadata = {
            "avg_qoe": float(getattr(summary, "avg_qoe", 0)),
            "p10_qoe": float(getattr(summary, "p10_qoe", 0)),
            "p50_qoe": float(getattr(summary, "p50_qoe", 0)),
            "p90_qoe": float(getattr(summary, "p90_qoe", 0)),
            "session_qoe": float(getattr(summary, "session_qoe", 0)),
            "weakest_participant": getattr(summary, "weakest_participant", None),
            "qoe_variance": float(getattr(summary, "qoe_variance", 0)),
            "dominant_issue_distribution": getattr(summary, "dominant_issue_distribution", {}),
            "timeline_points": len(qoe_values),
        }

        return SessionProofPayload(
            session_id=session_id,
            qoe_start=qoe_start,
            qoe_minimum=qoe_minimum,
            qoe_recovery=qoe_recovery,
            stall_count=stall_count,
            session_duration=session_duration,
            sla_threshold=self.sla_threshold,
            max_stalls=self.max_stalls,
            metadata=metadata,
        )

    async def generate_session_proof(self, payload: SessionProofPayload) -> dict[str, Any]:
        circuit_input = payload.to_circuit_input()
        result = self.generator.generate_proof(circuit_input)
        now = datetime.now(tz=UTC)
        proof_doc = {
            "proof_id": result["proof_hash"],
            "session_id": payload.session_id,
            "proof_hash": result["proof_hash"],
            "proof_mode": result["proof_mode"],
            "verified": bool(result["verified"]),
            "sla_met": bool(result["sla_met"]),
            "algorithm": "groth16" if result["proof_mode"] == "groth16" else "sha256-commitment-fallback",
            "public_signals": result["public_signals"],
            "proof": result["proof"],
            "anchor": result.get("anchor"),
            "created_at": now.isoformat(),
            "ts": int(now.timestamp() * 1000),
            "payload": {
                **circuit_input,
                "metadata": payload.metadata,
            },
        }
        await self.database["zk_proofs"].replace_one(
            {"session_id": payload.session_id},
            proof_doc,
            upsert=True,
        )
        await self.database["zk_audit_logs"].insert_one(
            {
                "action": "generate-proof",
                "session_id": payload.session_id,
                "proof_hash": proof_doc["proof_hash"],
                "proof_mode": proof_doc["proof_mode"],
                "verified": proof_doc["verified"],
                "ts": proof_doc["ts"],
            }
        )
        return proof_doc

    async def verify_session_proof(self, payload: SessionProofPayload, proof_doc: dict[str, Any]) -> dict[str, Any]:
        verification = self.generator.verify_proof(payload.to_circuit_input(), proof_doc)
        await self.database["zk_audit_logs"].insert_one(
            {
                "action": "verify-proof",
                "session_id": payload.session_id,
                "proof_hash": proof_doc.get("proof_hash"),
                "verified": bool(verification["verified"]),
                "ts": int(datetime.now(tz=UTC).timestamp() * 1000),
            }
        )
        return verification

    async def get_session_proof(self, session_id: str) -> dict[str, Any] | None:
        return await self.database["zk_proofs"].find_one({"session_id": session_id}, {"_id": 0})

    async def get_session_audit_logs(self, session_id: str) -> list[dict[str, Any]]:
        return await self.database["zk_audit_logs"].find(
            {"session_id": session_id},
            {"_id": 0},
        ).sort("ts", -1).to_list(length=50)
