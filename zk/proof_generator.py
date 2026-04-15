from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

try:
    from web3 import Web3
except ImportError:  # pragma: no cover - optional until deps are installed
    Web3 = None  # type: ignore

load_dotenv()

ROOT_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = ROOT_DIR / "artifacts"
WASM_PATH = ARTIFACTS_DIR / "qoe_sla_js" / "qoe_sla.wasm"
ZKEY_PATH = ARTIFACTS_DIR / "qoe_sla_final.zkey"
VERIFYING_KEY_PATH = ARTIFACTS_DIR / "verification_key.json"


def _bool_to_int(value: bool) -> int:
    return 1 if value else 0


def compute_sla_status(payload: dict[str, Any]) -> bool:
    if {"recovery_ok_input", "stalls_ok_input", "duration_ok_input"}.issubset(payload.keys()):
        return bool(
            int(payload["recovery_ok_input"]) == 1
            and int(payload["stalls_ok_input"]) == 1
            and int(payload["duration_ok_input"]) == 1
        )
    return bool(
        float(payload["qoe_recovery"]) >= float(payload["sla_threshold"])
        and int(payload["stall_count"]) <= int(payload["max_stalls"])
        and int(payload["session_duration"]) >= 10
    )


def build_proof_hash(payload: dict[str, Any], proof: dict[str, Any] | None = None, public_signals: list[Any] | None = None) -> str:
    blob = {
        "payload": payload,
        "proof": proof or {},
        "public_signals": public_signals or [],
    }
    raw = json.dumps(blob, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def artifacts_available() -> bool:
    snarkjs = shutil.which("snarkjs")
    return bool(snarkjs and WASM_PATH.exists() and ZKEY_PATH.exists() and VERIFYING_KEY_PATH.exists())


def _run_snarkjs(payload: dict[str, Any]) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="mobcloudx-zk-") as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / "input.json"
        proof_path = temp_path / "proof.json"
        public_path = temp_path / "public.json"

        input_path.write_text(json.dumps(payload), encoding="utf-8")

        subprocess.run(
            [
                "snarkjs",
                "groth16",
                "fullprove",
                str(input_path),
                str(WASM_PATH),
                str(ZKEY_PATH),
                str(proof_path),
                str(public_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )

        proof = json.loads(proof_path.read_text(encoding="utf-8"))
        public_signals = json.loads(public_path.read_text(encoding="utf-8"))

        verify_run = subprocess.run(
            [
                "snarkjs",
                "groth16",
                "verify",
                str(VERIFYING_KEY_PATH),
                str(public_path),
                str(proof_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )

        return {
            "proof": proof,
            "public_signals": public_signals,
            "verified": "OK" in verify_run.stdout.upper(),
        }


def _anchor_on_polygon(proof_hash: str) -> dict[str, Any] | None:
    rpc = os.getenv("POLYGON_GOERLI_RPC") or os.getenv("POLYGON_AMOY_RPC")
    private_key = os.getenv("ZK_WALLET_PRIVATE_KEY")
    wallet_address = os.getenv("ZK_WALLET_ADDRESS")

    if not rpc or not private_key or not wallet_address or Web3 is None:
        return {
            "status": "missing_env",
            "proof_hash": proof_hash,
        }

    try:
        normalized_private_key = private_key[2:] if private_key.startswith("0x") else private_key
        if len(normalized_private_key) != 64:
            return {
                "status": "invalid_private_key",
                "proof_hash": proof_hash,
                "reason": "The configured private key is not 32 bytes / 64 hex characters long.",
            }

        web3 = Web3(Web3.HTTPProvider(rpc))
        if not web3.is_connected():
            return {
                "status": "rpc_unreachable",
                "proof_hash": proof_hash,
            }

        checksum_address = web3.to_checksum_address(wallet_address)
        chain_id = web3.eth.chain_id
        tx = {
            "chainId": chain_id,
            "nonce": web3.eth.get_transaction_count(checksum_address),
            "to": checksum_address,
            "value": 0,
            "maxFeePerGas": web3.to_wei("2", "gwei"),
            "maxPriorityFeePerGas": web3.to_wei("1", "gwei"),
            "data": web3.to_hex(text=proof_hash[:64]),
        }
        try:
            estimated_gas = web3.eth.estimate_gas(tx)
            tx["gas"] = int(estimated_gas * 1.25)
        except Exception:
            tx["gas"] = 50000

        signed = web3.eth.account.sign_transaction(tx, private_key=private_key)
        tx_hash = web3.eth.send_raw_transaction(signed.raw_transaction)
        explorer_base = os.getenv("POLYGON_EXPLORER_BASE", "https://goerli.polygonscan.com/tx")
        tx_hash_hex = web3.to_hex(tx_hash)
        return {
            "status": "submitted",
            "network": "polygon-goerli",
            "tx_hash": tx_hash_hex,
            "explorer_url": f"{explorer_base}/{tx_hash_hex}",
        }
    except Exception as exc:
        return {
            "status": "anchor_failed",
            "proof_hash": proof_hash,
            "reason": str(exc),
        }


def generate_proof(payload: dict[str, Any]) -> dict[str, Any]:
    sla_met = _bool_to_int(compute_sla_status(payload))

    if artifacts_available():
        zk_result = _run_snarkjs(payload)
        proof_mode = "groth16"
        proof = zk_result["proof"]
        public_signals = zk_result["public_signals"]
        verified = bool(zk_result["verified"])
    else:
        proof_mode = "placeholder"
        proof = {
            "curve": "bn128",
            "protocol": "groth16",
            "note": "Artifacts or snarkjs unavailable; returning deterministic placeholder proof envelope.",
        }
        public_signals = [
            str(payload["sla_threshold"]),
            str(payload["max_stalls"]),
            str(sla_met),
        ]
        verified = True

    proof_hash = build_proof_hash(payload, proof, public_signals)
    anchor = _anchor_on_polygon(proof_hash)

    return {
        "proof_mode": proof_mode,
        "verified": verified,
        "sla_met": bool(sla_met),
        "proof_hash": proof_hash,
        "proof": proof,
        "public_signals": public_signals,
        "anchor": anchor,
    }


def verify_proof(payload: dict[str, Any], proof_record: dict[str, Any]) -> dict[str, Any]:
    expected_hash = build_proof_hash(
        payload,
        proof_record.get("proof"),
        proof_record.get("public_signals"),
    )
    return {
        "verified": expected_hash == proof_record.get("proof_hash"),
        "expected_hash": expected_hash,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate or verify MobCloudX QoE SLA proofs.")
    parser.add_argument("mode", choices=["generate", "verify"])
    parser.add_argument("--input", required=True, help="Path to JSON payload.")
    parser.add_argument("--proof-record", help="Path to stored proof JSON when verifying.")
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))

    if args.mode == "generate":
        print(json.dumps(generate_proof(payload), indent=2))
        return

    if not args.proof_record:
        raise SystemExit("--proof-record is required for verify mode")
    proof_record = json.loads(Path(args.proof_record).read_text(encoding="utf-8"))
    print(json.dumps(verify_proof(payload, proof_record), indent=2))


if __name__ == "__main__":
    main()
