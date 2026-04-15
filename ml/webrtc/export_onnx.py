"""
Requirements:
  pip install torch onnx onnxruntime
"""

from __future__ import annotations

import shutil
import time
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic

from train_congestion_lstm import CHECKPOINT_PATH, FEATURE_COUNT, SEQUENCE_LENGTH, WebRTCCongestionLSTM


WEIGHTS_DIR = Path(__file__).resolve().parent
ONNX_FP32_PATH = WEIGHTS_DIR / "checkpoints" / "webrtc_congestion_lstm_fp32.onnx"
ONNX_INT8_PATH = WEIGHTS_DIR / "checkpoints" / "webrtc_congestion_lstm_int8.onnx"
ASSET_OUTPUT_PATH = Path(__file__).resolve().parents[2] / "sdk" / "expo-app" / "assets" / "webrtc_congestion_lstm_int8.onnx"
NORMALISATION_SOURCE_PATH = WEIGHTS_DIR / "normalization_params.json"
NORMALISATION_ASSET_PATH = Path(__file__).resolve().parents[2] / "sdk" / "expo-app" / "assets" / "normalization_params.json"
MAX_CONGESTION_ABS_DIFF = 0.02
MAX_BITRATE_ABS_DIFF = 200.0


def evaluate_candidate(
    candidate_path: Path,
    sample_input: np.ndarray,
    fp32_outputs: list[np.ndarray],
) -> tuple[float, float, float, float, float]:
    session = ort.InferenceSession(str(candidate_path), providers=["CPUExecutionProvider"])
    outputs = session.run(None, {"telemetry_sequence": sample_input})
    latency_ms = benchmark_session(session, sample_input)
    congestion_relative_diff = max_relative_difference(fp32_outputs[0], outputs[0])
    congestion_absolute_diff = max_absolute_difference(fp32_outputs[0], outputs[0])
    bitrate_relative_diff = max_relative_difference(fp32_outputs[1], outputs[1])
    bitrate_absolute_diff = max_absolute_difference(fp32_outputs[1], outputs[1])
    return (
        latency_ms,
        congestion_relative_diff,
        congestion_absolute_diff,
        bitrate_relative_diff,
        bitrate_absolute_diff,
    )


def benchmark_session(session: ort.InferenceSession, sample_input: np.ndarray, iterations: int = 200) -> float:
    start = time.perf_counter()
    for _ in range(iterations):
        session.run(None, {"telemetry_sequence": sample_input})
    elapsed = time.perf_counter() - start
    return (elapsed / iterations) * 1000.0


def max_relative_difference(reference: np.ndarray, candidate: np.ndarray) -> float:
    denominator = np.maximum(np.abs(reference), 1e-6)
    return float(np.max(np.abs(reference - candidate) / denominator))


def max_absolute_difference(reference: np.ndarray, candidate: np.ndarray) -> float:
    return float(np.max(np.abs(reference - candidate)))


def main() -> None:
    if not CHECKPOINT_PATH.exists():
        raise FileNotFoundError(f"Checkpoint not found: {CHECKPOINT_PATH}")

    checkpoint = torch.load(CHECKPOINT_PATH, map_location="cpu")
    model = WebRTCCongestionLSTM()
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    ONNX_FP32_PATH.parent.mkdir(parents=True, exist_ok=True)
    ASSET_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    NORMALISATION_ASSET_PATH.parent.mkdir(parents=True, exist_ok=True)

    dummy_input = torch.randn(1, SEQUENCE_LENGTH, FEATURE_COUNT, dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy_input,
        ONNX_FP32_PATH,
        export_params=True,
        opset_version=17,
        dynamo=False,
        input_names=["telemetry_sequence"],
        output_names=["congestion_probability", "predicted_bitrate"],
        dynamic_axes={
            "telemetry_sequence": {0: "batch_size"},
            "congestion_probability": {0: "batch_size"},
            "predicted_bitrate": {0: "batch_size"},
        },
    )
    print(f"Exported FP32 ONNX model to: {ONNX_FP32_PATH}")

    fp32_session = ort.InferenceSession(str(ONNX_FP32_PATH), providers=["CPUExecutionProvider"])
    sample_input = np.random.randn(1, SEQUENCE_LENGTH, FEATURE_COUNT).astype(np.float32)
    fp32_outputs = fp32_session.run(None, {"telemetry_sequence": sample_input})
    print("Validated FP32 ONNX inference.")

    fp32_latency_ms = benchmark_session(fp32_session, sample_input)
    print(f"FP32 latency: {fp32_latency_ms:.3f} ms")
    onnx.checker.check_model(str(ONNX_FP32_PATH))

    candidate_specs = [
        ("full_int8", ["MatMul", "Gemm", "LSTM"], QuantType.QInt8),
        ("linear_int8", ["MatMul", "Gemm"], QuantType.QInt8),
        ("gemm_int8", ["Gemm"], QuantType.QInt8),
        ("linear_uint8", ["MatMul", "Gemm"], QuantType.QUInt8),
        ("gemm_uint8", ["Gemm"], QuantType.QUInt8),
    ]

    accepted_candidate: tuple[Path, tuple[float, float, float, float, float]] | None = None
    best_candidate: tuple[Path, tuple[float, float, float, float, float], str] | None = None

    for candidate_name, op_types, quant_type in candidate_specs:
        candidate_path = ONNX_INT8_PATH.with_name(f"{candidate_name}.onnx")
        try:
            quantize_dynamic(
                model_input=str(ONNX_FP32_PATH),
                model_output=str(candidate_path),
                weight_type=quant_type,
                op_types_to_quantize=op_types,
            )
            metrics = evaluate_candidate(candidate_path, sample_input, fp32_outputs)
        except Exception as error:
            print(f"Quantization candidate {candidate_name} failed: {error}")
            continue

        (
            candidate_latency_ms,
            congestion_relative_diff,
            congestion_absolute_diff,
            bitrate_relative_diff,
            bitrate_absolute_diff,
        ) = metrics

        print(f"[{candidate_name}] latency: {candidate_latency_ms:.3f} ms")
        print(f"[{candidate_name}] Max relative congestion diff: {congestion_relative_diff * 100:.2f}%")
        print(f"[{candidate_name}] Max absolute congestion diff: {congestion_absolute_diff * 100:.2f} percentage points")
        print(f"[{candidate_name}] Max relative bitrate diff: {bitrate_relative_diff * 100:.2f}%")
        print(f"[{candidate_name}] Max absolute bitrate diff: {bitrate_absolute_diff:.2f} kbps")

        if best_candidate is None or (
            congestion_absolute_diff + (bitrate_absolute_diff / 1000.0),
            candidate_latency_ms,
        ) < (
            best_candidate[1][2] + (best_candidate[1][4] / 1000.0),
            best_candidate[1][0],
        ):
            best_candidate = (candidate_path, metrics, candidate_name)

        if congestion_absolute_diff < MAX_CONGESTION_ABS_DIFF and bitrate_absolute_diff < MAX_BITRATE_ABS_DIFF:
            accepted_candidate = (candidate_path, metrics)
            print(f"Selected quantization candidate: {candidate_name}")
            break

    if accepted_candidate is None:
        if best_candidate is None:
            raise RuntimeError("All quantization candidates failed before validation.")

        best_path, best_metrics, best_name = best_candidate
        raise RuntimeError(
            "No quantized model met the acceptance thresholds. "
            f"Best candidate was {best_name} with "
            f"congestion abs diff {best_metrics[2] * 100:.2f} percentage points and "
            f"bitrate abs diff {best_metrics[4]:.2f} kbps."
        )

    shutil.copy2(accepted_candidate[0], ONNX_INT8_PATH)
    print(f"Exported INT8 ONNX model to: {ONNX_INT8_PATH}")

    int8_latency_ms = accepted_candidate[1][0]
    if int8_latency_ms > 15.0:
        print("Warning: INT8 inference latency exceeded 15 ms target.")

    shutil.copy2(ONNX_INT8_PATH, ASSET_OUTPUT_PATH)
    print(f"Copied quantized ONNX model to app assets: {ASSET_OUTPUT_PATH}")
    if NORMALISATION_SOURCE_PATH.exists():
        shutil.copy2(NORMALISATION_SOURCE_PATH, NORMALISATION_ASSET_PATH)
        print(f"Copied normalization parameters to app assets: {NORMALISATION_ASSET_PATH}")


if __name__ == "__main__":
    main()
