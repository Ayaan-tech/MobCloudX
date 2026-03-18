"""
inference/models/throughput_predictor.py

XGBoost-only throughput predictor.
- Applies log1p to throughput input column before normalisation
- Applies expm1 to the raw log-space output from the model
- Correctly tiles the per-feature (6,) scaler across the 30-column flat input
- Thread-safe singleton via threading.Lock
- Zero-pad (not first-segment-repeat) for histories shorter than WINDOW_SIZE
"""

import os
import pickle
import threading
import numpy as np
from typing import List, Optional

# ── Paths ──────────────────────────────────────────────────────────────────────

_DIR = os.path.dirname(__file__)
MODEL_XGB_PATH = os.path.join(_DIR, "throughput_xgb.pkl")
SCALER_PATH    = os.path.join(_DIR, "throughput_scaler.npz")

# ── Schema ─────────────────────────────────────────────────────────────────────

FEATURE_COLS = ["throughput_kbps", "buffer_health", "bitrate",
                "latency", "rebuffering", "qoe_score"]
N_FEATURES   = len(FEATURE_COLS)          # 6
TPUT_IDX     = FEATURE_COLS.index("throughput_kbps")   # 0
WINDOW_SIZE  = 5
FLAT_DIM     = WINDOW_SIZE * N_FEATURES   # 30


class ThroughputPredictor:
    """
    Loads the XGBoost model (throughput_xgb.pkl) and the accompanying scaler
    (throughput_scaler.npz) that were produced by train_xgb.py.

    Inference contract
    ------------------
    Input  : last ≤ WINDOW_SIZE streaming-segment dicts, each with keys in
             FEATURE_COLS.  Shorter histories are zero-padded on the left.
    Output : predicted next-segment throughput in kbps (float ≥ 0).
             Returns -1.0 on any failure.

    Normalisation
    -------------
    The scaler stores per-feature mean/std computed over the TRAINING rows
    (shape (6,)).  Before calling the model we:
      1. Apply log1p to the throughput column (index 0) of the (5×6) window.
      2. Flatten to (30,) and tile the (6,) scaler to (30,) for element-wise
         normalisation — matching exactly what train_xgb.py did.
      3. XGBoost predicts directly in log-space; we apply expm1 to recover kbps.
    """

    def __init__(self) -> None:
        self._model: Optional[object] = None

        # Scaler arrays — shape (6,) each
        self._mean: Optional[np.ndarray] = None
        self._std:  Optional[np.ndarray] = None
        self._log_target: bool = True

        # Tiled scaler for the flat (30,) input — built once after loading
        self._mean_flat: Optional[np.ndarray] = None  # shape (30,)
        self._std_flat:  Optional[np.ndarray] = None  # shape (30,)

        self._load()

    # ── Private helpers ────────────────────────────────────────────────────────

    def _load(self) -> None:
        """Load scaler then model.  Sets self._model=None on any failure."""

        # 1. Scaler
        if not os.path.exists(SCALER_PATH):
            print("[ThroughputPredictor] scaler not found — predictor disabled")
            return
        try:
            sc = np.load(SCALER_PATH)
            self._mean = sc["mean"].astype(np.float64)   # (6,)
            self._std  = sc["std"].astype(np.float64)    # (6,)

            # log_target flag — stored as a 1-element boolean array
            if "log_target" in sc:
                self._log_target = bool(sc["log_target"].flat[0])
            else:
                self._log_target = True   # safe default; training always sets True

        except Exception as exc:
            print(f"[ThroughputPredictor] Scaler load error: {exc}")
            return

        # Check if scaler is already flat (30,) or per-feature (6,)
        if self._mean.shape[0] == FLAT_DIM:
            # Already flattened by training script
            self._mean_flat = self._mean
            self._std_flat  = self._std
        elif self._mean.shape[0] == N_FEATURES:
            # Per-feature scaler → tile to flat dimension
            self._mean_flat = np.tile(self._mean, WINDOW_SIZE)   # (6,) → (30,)
            self._std_flat  = np.tile(self._std,  WINDOW_SIZE)
        else:
            print(f"[ThroughputPredictor] Unexpected scaler shape: {self._mean.shape}")
            return

        # 2. XGBoost model
        if not os.path.exists(MODEL_XGB_PATH):
            print("[ThroughputPredictor] throughput_xgb.pkl not found — predictor disabled")
            return
        try:
            import xgboost as xgb   # noqa: F401  (validate import here)
            with open(MODEL_XGB_PATH, "rb") as fh:
                self._model = pickle.load(fh)
            print(
                f"[ThroughputPredictor] XGBoost loaded  "
                f"(log_target={self._log_target}, window={WINDOW_SIZE})"
            )
        except Exception as exc:
            print(f"[ThroughputPredictor] XGBoost load failed: {exc}")
            self._model = None

    def _build_window(self, history: List[dict]) -> np.ndarray:
        """
        Return a zero-padded (WINDOW_SIZE, N_FEATURES) float32 array from
        the tail of *history*.

        Zero-padding is used for short histories instead of first-segment
        repetition, which avoids biasing predictions when the earliest known
        segment has an atypical throughput value.
        """
        tail = list(history[-WINDOW_SIZE:])          # at most WINDOW_SIZE rows
        n    = len(tail)

        window = np.zeros((WINDOW_SIZE, N_FEATURES), dtype=np.float32)
        if n > 0:
            for row_idx, seg in enumerate(tail):
                window_row = WINDOW_SIZE - n + row_idx   # left-align zeros
                for col_idx, col in enumerate(FEATURE_COLS):
                    window[window_row, col_idx] = float(seg.get(col, 0.0))

        return window

    # ── Public API ─────────────────────────────────────────────────────────────

    def is_available(self) -> bool:
        """True when the model and scaler are loaded and ready."""
        return self._model is not None

    def predict(self, history: List[dict]) -> float:
        """
        Predict the next-segment throughput in kbps.

        Parameters
        ----------
        history : list of dicts
            Each dict must contain at least the keys in FEATURE_COLS.
            Only the last WINDOW_SIZE entries are used.

        Returns
        -------
        float
            Predicted kbps (≥ 0.0), or -1.0 on failure / model unavailable.
        """
        if not self.is_available():
            return -1.0

        try:
            import xgboost as xgb

            # 1. Build (5, 6) window — zero-padded on the left for short histories
            window = self._build_window(history)

            # 2. Log-transform the throughput column before normalisation
            if self._log_target:
                window[:, TPUT_IDX] = np.log1p(window[:, TPUT_IDX])

            # 3. Flatten → (30,) then normalise with the tiled scaler
            flat   = window.flatten()                        # (30,)
            flat_n = (flat - self._mean_flat) / self._std_flat  # (30,)

            # 4. XGBoost inference — model predicts in log-space
            dm       = xgb.DMatrix(flat_n.reshape(1, -1))
            pred_log = float(self._model.predict(dm)[0])

            # 5. Recover kbps from log-space
            if self._log_target:
                return float(max(0.0, np.expm1(max(pred_log, 0.0))))
            return float(max(0.0, pred_log))

        except Exception as exc:
            print(f"[ThroughputPredictor] predict error: {exc}")
            return -1.0


# ── Thread-safe module-level singleton ─────────────────────────────────────────

_predictor: Optional[ThroughputPredictor] = None
_lock = threading.Lock()


def get_predictor() -> ThroughputPredictor:
    """
    Return the module-level ThroughputPredictor singleton.
    Thread-safe: uses a lock to prevent double-initialisation under concurrency.
    """
    global _predictor
    if _predictor is None:
        with _lock:
            # Re-check inside the lock (classic double-checked locking pattern)
            if _predictor is None:
                _predictor = ThroughputPredictor()
    return _predictor