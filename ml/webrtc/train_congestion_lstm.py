"""
Requirements:
  pip install numpy h5py torch scikit-learn tqdm
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import h5py
import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader, Dataset
from tqdm import tqdm


DATA_PATH = Path(__file__).resolve().parent / "data" / "webrtc_synthetic_20k.h5"
CHECKPOINT_DIR = Path(__file__).resolve().parent / "checkpoints"
CHECKPOINT_PATH = CHECKPOINT_DIR / "best_congestion_lstm.pt"
NORMALIZATION_PATH = Path(__file__).resolve().parent / "normalization_params.json"
SEQUENCE_LENGTH = 10
FEATURE_COUNT = 6
BATCH_SIZE = 512
EPOCHS = 50
PATIENCE = 10
LEARNING_RATE = 1e-3
WEIGHT_DECAY = 1e-4
MAPE_TARGET = 8.0
AUC_TARGET = 0.92
TRAIN_SPLIT = 0.8
VAL_SPLIT = 0.1
WINDOWS_PER_SESSION = 300 - SEQUENCE_LENGTH + 1
EVAL_BATCH_SIZE = 1024
SEED = 42
MAX_BITRATE_TARGET_KBPS = 10_000.0
MAX_POS_WEIGHT = 64.0

FEATURE_NAMES = [
    "rtt_ms",
    "jitter_ms",
    "plr",
    "available_bitrate_kbps",
    "fps",
    "freeze_occurred",
]


class WebRTCCongestionLSTM(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=FEATURE_COUNT,
            hidden_size=64,
            num_layers=2,
            dropout=0.2,
            batch_first=True,
        )
        self.projection = nn.Sequential(
            nn.Linear(64, 32),
            nn.ReLU(),
        )
        self.congestion_head = nn.Linear(32, 1)
        self.bitrate_head = nn.Sequential(
            nn.Linear(32, 1),
            nn.ReLU(),
        )

    def forward_features(self, telemetry_sequence: torch.Tensor) -> torch.Tensor:
        lstm_output, _ = self.lstm(telemetry_sequence)
        last_hidden = lstm_output[:, -1, :]
        return self.projection(last_hidden)

    def forward_logits(self, telemetry_sequence: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        projected = self.forward_features(telemetry_sequence)
        congestion_logits = self.congestion_head(projected).squeeze(-1)
        predicted_bitrate = self.bitrate_head(projected).squeeze(-1)
        return congestion_logits, predicted_bitrate

    def forward(self, telemetry_sequence: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        congestion_logits, predicted_bitrate = self.forward_logits(telemetry_sequence)
        congestion_probability = torch.sigmoid(congestion_logits)
        return congestion_probability, predicted_bitrate


class TensorSequenceDataset(Dataset[tuple[torch.Tensor, torch.Tensor, torch.Tensor]]):
    def __init__(
        self,
        sequences: torch.Tensor,
        congestion_labels: torch.Tensor,
        bitrate_labels: torch.Tensor,
    ) -> None:
        self.sequences = sequences.contiguous()
        self.congestion_labels = congestion_labels.contiguous()
        self.bitrate_labels = bitrate_labels.contiguous()

    def __len__(self) -> int:
        return int(self.sequences.shape[0])

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        return (
            self.sequences[index],
            self.congestion_labels[index],
            self.bitrate_labels[index],
        )


@dataclass
class EpochMetrics:
    loss: float
    auc_roc: float
    f1: float
    precision: float
    recall: float
    mae: float
    mape: float


def configure_runtime(device: torch.device) -> None:
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    if device.type == "cuda":
        torch.cuda.manual_seed_all(SEED)
        torch.backends.cudnn.benchmark = True
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        torch.set_float32_matmul_precision("high")


def compute_normalization_stats(features: np.ndarray) -> dict[str, dict[str, float]]:
    stats: dict[str, dict[str, float]] = {}
    flat_features = features.reshape(-1, features.shape[-1]).astype(np.float64)

    for feature_index, feature_name in enumerate(FEATURE_NAMES):
        column = flat_features[:, feature_index]
        feature_stats: dict[str, float] = {
            "mean": float(column.mean()),
            "std": float(column.std(ddof=0) + 1e-6),
        }
        if feature_name == "rtt_ms":
            feature_stats.update({"min": 0.0, "max": 800.0})
        elif feature_name == "plr":
            feature_stats.update({"min": 0.0, "max": 0.5})
        elif feature_name == "fps":
            feature_stats.update({"min": 0.0, "max": 30.0})
        stats[feature_name] = feature_stats

    return stats


def normalize_features(
    features: np.ndarray,
    normalization_stats: dict[str, dict[str, float]],
) -> np.ndarray:
    normalized = features.astype(np.float32, copy=True)
    for feature_index, feature_name in enumerate(FEATURE_NAMES):
        mean_value = normalization_stats[feature_name]["mean"]
        std_value = normalization_stats[feature_name]["std"]
        normalized[:, :, feature_index] = (
            normalized[:, :, feature_index] - mean_value
        ) / std_value
    return normalized


def clamp_bitrate_targets(bitrate_labels: np.ndarray) -> np.ndarray:
    return np.clip(bitrate_labels.astype(np.float32, copy=False), 0.0, MAX_BITRATE_TARGET_KBPS)


def split_sessions(num_sessions: int, seed: int = SEED) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    session_indices = np.arange(num_sessions, dtype=np.int64)
    rng.shuffle(session_indices)
    train_end = int(num_sessions * TRAIN_SPLIT)
    val_end = train_end + int(num_sessions * VAL_SPLIT)
    return (
        session_indices[:train_end],
        session_indices[train_end:val_end],
        session_indices[val_end:],
    )


def load_split_arrays(
    data_path: Path,
    session_indices: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    sorted_indices = np.sort(np.asarray(session_indices, dtype=np.int64))
    with h5py.File(data_path, "r") as h5_file:
        features = np.asarray(h5_file["features"][sorted_indices], dtype=np.float32)
        congestion = np.asarray(h5_file["congestion_onset"][sorted_indices], dtype=np.float32)
        bitrate = np.asarray(h5_file["next_bitrate"][sorted_indices], dtype=np.float32)
    return features, congestion, bitrate


def build_windowed_tensors(
    features: np.ndarray,
    congestion_labels: np.ndarray,
    bitrate_labels: np.ndarray,
    sequence_length: int,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    session_count, interval_count, feature_count = features.shape
    windows_per_session = interval_count - sequence_length + 1
    total_windows = session_count * windows_per_session

    sequences = np.empty((total_windows, sequence_length, feature_count), dtype=np.float32)
    congestion_targets = np.empty((total_windows,), dtype=np.float32)
    bitrate_targets = np.empty((total_windows,), dtype=np.float32)

    cursor = 0
    for session_index in tqdm(range(session_count), desc="Precomputing windows", leave=False):
        session_features = features[session_index]
        for start in range(windows_per_session):
            end = start + sequence_length
            target_index = end - 1
            sequences[cursor] = session_features[start:end]
            congestion_targets[cursor] = congestion_labels[session_index, target_index]
            bitrate_targets[cursor] = bitrate_labels[session_index, target_index]
            cursor += 1

    return (
        torch.from_numpy(sequences),
        torch.from_numpy(congestion_targets),
        torch.from_numpy(bitrate_targets),
    )


def build_dataset(
    split_name: str,
    features: np.ndarray,
    congestion_labels: np.ndarray,
    bitrate_labels: np.ndarray,
    normalization_stats: dict[str, dict[str, float]],
) -> TensorSequenceDataset:
    print(f"Normalizing {split_name} features in RAM...")
    normalized_features = normalize_features(features, normalization_stats)
    print(f"Materializing {split_name} sliding windows in RAM...")
    sequences, congestion_targets, bitrate_targets = build_windowed_tensors(
        normalized_features,
        congestion_labels,
        bitrate_labels,
        SEQUENCE_LENGTH,
    )
    print(
        f"{split_name.capitalize()} dataset ready: "
        f"{sequences.shape[0]:,} windows of shape {tuple(sequences.shape[1:])}"
    )
    return TensorSequenceDataset(sequences, congestion_targets, bitrate_targets)


def create_dataloader(
    dataset: TensorSequenceDataset,
    batch_size: int,
    shuffle: bool,
    device: torch.device,
) -> DataLoader[tuple[torch.Tensor, torch.Tensor, torch.Tensor]]:
    return DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=shuffle,
        num_workers=0,
        pin_memory=device.type == "cuda",
        drop_last=shuffle,
    )


def combined_loss(
    congestion_logits: torch.Tensor,
    bitrate_pred: torch.Tensor,
    congestion_target: torch.Tensor,
    bitrate_target: torch.Tensor,
    pos_weight: torch.Tensor | None = None,
) -> torch.Tensor:
    bce_loss = nn.functional.binary_cross_entropy_with_logits(
        congestion_logits,
        congestion_target,
        pos_weight=pos_weight,
    )
    mse_loss = nn.functional.mse_loss(bitrate_pred, bitrate_target)
    return bce_loss + mse_loss / 10_000.0


def evaluate(
    model: WebRTCCongestionLSTM,
    dataloader: DataLoader[tuple[torch.Tensor, torch.Tensor, torch.Tensor]],
    device: torch.device,
    pos_weight: torch.Tensor | None,
) -> EpochMetrics:
    model.eval()
    losses: list[float] = []
    congestion_targets: list[np.ndarray] = []
    congestion_predictions: list[np.ndarray] = []
    bitrate_targets: list[np.ndarray] = []
    bitrate_predictions: list[np.ndarray] = []
    use_amp = device.type == "cuda"

    with torch.no_grad():
        for sequences, congestion_target, bitrate_target in tqdm(dataloader, desc="Evaluating", leave=False):
            sequences = sequences.to(device, non_blocking=True)
            congestion_target = congestion_target.to(device, non_blocking=True)
            bitrate_target = bitrate_target.to(device, non_blocking=True)

            with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=use_amp):
                congestion_logits, bitrate_pred = model.forward_logits(sequences)
                loss = combined_loss(
                    congestion_logits,
                    bitrate_pred,
                    congestion_target,
                    bitrate_target,
                    pos_weight=pos_weight,
                )
                congestion_pred = torch.sigmoid(congestion_logits)

            losses.append(float(loss.item()))
            congestion_targets.append(congestion_target.cpu().numpy())
            congestion_predictions.append(congestion_pred.float().cpu().numpy())
            bitrate_targets.append(bitrate_target.cpu().numpy())
            bitrate_predictions.append(bitrate_pred.float().cpu().numpy())

    y_true = np.concatenate(congestion_targets, axis=0)
    y_pred = np.concatenate(congestion_predictions, axis=0)
    bitrate_true = np.concatenate(bitrate_targets, axis=0)
    bitrate_pred = np.concatenate(bitrate_predictions, axis=0)

    binary_pred = (y_pred >= 0.5).astype(np.int32)
    mae = float(np.mean(np.abs(bitrate_true - bitrate_pred)))
    mape = float(
        np.mean(np.abs(bitrate_true - bitrate_pred) / np.maximum(np.abs(bitrate_true), 1.0)) * 100.0
    )

    return EpochMetrics(
        loss=float(np.mean(losses)),
        auc_roc=float(roc_auc_score(y_true, y_pred)),
        f1=float(f1_score(y_true, binary_pred, zero_division=0)),
        precision=float(precision_score(y_true, binary_pred, zero_division=0)),
        recall=float(recall_score(y_true, binary_pred, zero_division=0)),
        mae=mae,
        mape=mape,
    )


def train_epoch(
    model: WebRTCCongestionLSTM,
    dataloader: DataLoader[tuple[torch.Tensor, torch.Tensor, torch.Tensor]],
    optimizer: torch.optim.Optimizer,
    device: torch.device,
    scaler: torch.amp.GradScaler | None,
    pos_weight: torch.Tensor | None,
) -> float:
    model.train()
    losses: list[float] = []
    use_amp = device.type == "cuda"

    for sequences, congestion_target, bitrate_target in tqdm(dataloader, desc="Training", leave=False):
        sequences = sequences.to(device, non_blocking=True)
        congestion_target = congestion_target.to(device, non_blocking=True)
        bitrate_target = bitrate_target.to(device, non_blocking=True)

        optimizer.zero_grad(set_to_none=True)

        with torch.autocast(device_type=device.type, dtype=torch.float16, enabled=use_amp):
            congestion_logits, bitrate_pred = model.forward_logits(sequences)
            loss = combined_loss(
                congestion_logits,
                bitrate_pred,
                congestion_target,
                bitrate_target,
                pos_weight=pos_weight,
            )

        if scaler is not None and use_amp:
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
        else:
            loss.backward()
            optimizer.step()

        losses.append(float(loss.item()))

    return float(np.mean(losses))


def compute_positive_class_weight(congestion_labels: np.ndarray) -> float:
    positives = float(np.sum(congestion_labels))
    negatives = float(congestion_labels.size - positives)
    if positives <= 0:
        return 1.0
    return min(MAX_POS_WEIGHT, max(1.0, negatives / positives))


def save_checkpoint(
    model: WebRTCCongestionLSTM,
    optimizer: torch.optim.Optimizer,
    scheduler: CosineAnnealingLR,
    epoch: int,
    metrics: EpochMetrics,
    normalization_stats: dict[str, dict[str, float]],
) -> None:
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "scheduler_state_dict": scheduler.state_dict(),
            "epoch": epoch,
            "metrics": metrics.__dict__,
            "normalization_stats": normalization_stats,
            "config": {
                "sequence_length": SEQUENCE_LENGTH,
                "feature_count": FEATURE_COUNT,
                "batch_size": BATCH_SIZE,
            },
        },
        CHECKPOINT_PATH,
    )


def describe_split(name: str, session_indices: np.ndarray) -> None:
    total_windows = len(session_indices) * WINDOWS_PER_SESSION
    print(f"{name}: {len(session_indices):,} sessions -> {total_windows:,} windows")


def main() -> None:
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Synthetic dataset not found: {DATA_PATH}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    configure_runtime(device)
    print(f"Using device: {device}")

    with h5py.File(DATA_PATH, "r") as h5_file:
        num_sessions = int(h5_file["features"].shape[0])

    train_sessions, val_sessions, test_sessions = split_sessions(num_sessions)
    describe_split("Train", train_sessions)
    describe_split("Val", val_sessions)
    describe_split("Test", test_sessions)

    print("Loading training split into RAM...")
    train_features, train_congestion, train_bitrate = load_split_arrays(DATA_PATH, train_sessions)
    normalization_stats = compute_normalization_stats(train_features)
    train_bitrate = clamp_bitrate_targets(train_bitrate)
    NORMALIZATION_PATH.write_text(json.dumps(normalization_stats, indent=2), encoding="utf-8")
    print(f"Saved normalization parameters to: {NORMALIZATION_PATH}")
    positive_class_weight = compute_positive_class_weight(train_congestion)
    print(f"Congestion positive class weight: {positive_class_weight:.2f}")

    print("Loading validation split into RAM...")
    val_features, val_congestion, val_bitrate = load_split_arrays(DATA_PATH, val_sessions)
    val_bitrate = clamp_bitrate_targets(val_bitrate)
    print("Loading test split into RAM...")
    test_features, test_congestion, test_bitrate = load_split_arrays(DATA_PATH, test_sessions)
    test_bitrate = clamp_bitrate_targets(test_bitrate)

    train_dataset = build_dataset("train", train_features, train_congestion, train_bitrate, normalization_stats)
    val_dataset = build_dataset("validation", val_features, val_congestion, val_bitrate, normalization_stats)
    test_dataset = build_dataset("test", test_features, test_congestion, test_bitrate, normalization_stats)

    del train_features, train_congestion, train_bitrate
    del val_features, val_congestion, val_bitrate
    del test_features, test_congestion, test_bitrate

    train_loader = create_dataloader(train_dataset, BATCH_SIZE, True, device)
    val_loader = create_dataloader(val_dataset, EVAL_BATCH_SIZE, False, device)
    test_loader = create_dataloader(test_dataset, EVAL_BATCH_SIZE, False, device)

    model = WebRTCCongestionLSTM().to(device)
    optimizer = AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
    scheduler = CosineAnnealingLR(optimizer, T_max=EPOCHS)
    scaler = torch.amp.GradScaler("cuda") if device.type == "cuda" else None
    pos_weight_tensor = torch.tensor(positive_class_weight, dtype=torch.float32, device=device)

    best_val_loss = math.inf
    epochs_without_improvement = 0

    for epoch in range(1, EPOCHS + 1):
        train_loss = train_epoch(model, train_loader, optimizer, device, scaler, pos_weight_tensor)
        val_metrics = evaluate(model, val_loader, device, pos_weight_tensor)
        scheduler.step()

        print(
            f"Epoch {epoch:02d} | train_loss={train_loss:.4f} | "
            f"val_loss={val_metrics.loss:.4f} | auc={val_metrics.auc_roc:.4f} | "
            f"f1={val_metrics.f1:.4f} | precision={val_metrics.precision:.4f} | "
            f"recall={val_metrics.recall:.4f} | mae={val_metrics.mae:.2f} | "
            f"mape={val_metrics.mape:.2f}%"
        )

        if val_metrics.loss < best_val_loss:
            best_val_loss = val_metrics.loss
            epochs_without_improvement = 0
            save_checkpoint(model, optimizer, scheduler, epoch, val_metrics, normalization_stats)
            print(f"Saved improved checkpoint to: {CHECKPOINT_PATH}")
        else:
            epochs_without_improvement += 1

        if val_metrics.auc_roc >= AUC_TARGET and val_metrics.mape <= MAPE_TARGET:
            print("Target metrics achieved. Stopping early.")
            break

        if epochs_without_improvement >= PATIENCE:
            print("Early stopping triggered.")
            break

    checkpoint = torch.load(CHECKPOINT_PATH, map_location=device)
    model.load_state_dict(checkpoint["model_state_dict"])
    test_metrics = evaluate(model, test_loader, device, pos_weight_tensor)

    print("\nFinal test metrics")
    print(f"AUC-ROC:   {test_metrics.auc_roc:.4f}")
    print(f"F1:        {test_metrics.f1:.4f}")
    print(f"Precision: {test_metrics.precision:.4f}")
    print(f"Recall:    {test_metrics.recall:.4f}")
    print(f"MAE:       {test_metrics.mae:.2f}")
    print(f"MAPE:      {test_metrics.mape:.2f}%")


if __name__ == "__main__":
    main()
