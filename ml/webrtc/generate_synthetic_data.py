"""
Requirements:
  pip install numpy h5py tqdm
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import h5py
import numpy as np
from tqdm import tqdm


NUM_SESSIONS = 20_000
SESSION_LENGTH = 300
FEATURE_COUNT = 6
AR_COEFF = 0.85
CONGESTION_SESSION_PROB = 0.15
MAX_TARGET_BITRATE_KBPS = 10_000.0
CONGESTION_LOOKAHEAD = 5
OUTPUT_PATH = Path(__file__).resolve().parent / "data" / "webrtc_synthetic_20k.h5"


@dataclass(frozen=True)
class NetworkProfile:
    name: str
    probability: float
    rtt_mean: float
    rtt_std: float
    plr_alpha: float
    plr_beta: float
    throughput_mean: float
    throughput_std: float
    sigma_rtt: float
    sigma_plr: float


NETWORK_PROFILES: tuple[NetworkProfile, ...] = (
    NetworkProfile("WiFi6", 0.30, 15, 5, 1, 99, 50_000, 5_000, 4, 0.003),
    NetworkProfile("4G_Good", 0.25, 45, 15, 2, 98, 8_000, 2_000, 8, 0.006),
    NetworkProfile("4G_Degraded", 0.20, 80, 25, 5, 95, 3_000, 1_000, 12, 0.010),
    NetworkProfile("3G", 0.15, 120, 40, 8, 92, 1_500, 500, 18, 0.015),
    NetworkProfile("Congested", 0.10, 200, 60, 15, 85, 800, 300, 30, 0.025),
)


def sample_profile(rng: np.random.Generator) -> NetworkProfile:
    probabilities = np.array([profile.probability for profile in NETWORK_PROFILES], dtype=np.float64)
    probabilities = probabilities / probabilities.sum()
    return NETWORK_PROFILES[int(rng.choice(len(NETWORK_PROFILES), p=probabilities))]


def next_bitrate_label(available_bitrate: np.ndarray) -> np.ndarray:
    shifted = np.empty_like(available_bitrate)
    shifted[:-1] = available_bitrate[1:]
    shifted[-1] = available_bitrate[-1]
    return shifted


def generate_session(
    rng: np.random.Generator,
    profile: NetworkProfile,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    base_rtt = max(1.0, rng.normal(profile.rtt_mean, profile.rtt_std))
    base_plr = float(rng.beta(profile.plr_alpha, profile.plr_beta))
    throughput = max(100.0, rng.normal(profile.throughput_mean, profile.throughput_std))

    rtt = np.zeros(SESSION_LENGTH, dtype=np.float32)
    plr = np.zeros(SESSION_LENGTH, dtype=np.float32)

    rtt[0] = base_rtt
    plr[0] = np.clip(base_plr, 0.0, 0.5)

    for t in range(1, SESSION_LENGTH):
        rtt_noise = rng.normal(0.0, profile.sigma_rtt)
        plr_noise = rng.normal(0.0, profile.sigma_plr)
        rtt[t] = max(
            1.0,
            AR_COEFF * rtt[t - 1] + (1.0 - AR_COEFF) * base_rtt + rtt_noise,
        )
        plr[t] = np.clip(
            AR_COEFF * plr[t - 1] + (1.0 - AR_COEFF) * base_plr + plr_noise,
            0.0,
            0.5,
        )

    congestion_onset = np.zeros(SESSION_LENGTH, dtype=np.float32)
    if rng.random() < CONGESTION_SESSION_PROB:
        event_start = int(rng.integers(60, 241))
        event_duration = int(rng.integers(10, 31))
        event_end = min(SESSION_LENGTH, event_start + event_duration)
        precursor_start = max(0, event_start - CONGESTION_LOOKAHEAD)

        # Create a short, worsening lead-in so the next-5-second onset label is
        # actually learnable from the preceding telemetry window.
        if precursor_start < event_start:
            ramp_length = event_start - precursor_start
            ramp = np.linspace(1.0, 2.2, ramp_length, dtype=np.float32)
            plr_ramp = np.linspace(1.0, 3.5, ramp_length, dtype=np.float32)
            rtt[precursor_start:event_start] = np.clip(
                rtt[precursor_start:event_start] * ramp,
                1.0,
                800.0,
            )
            plr[precursor_start:event_start] = np.clip(
                plr[precursor_start:event_start] * plr_ramp,
                0.0,
                0.5,
            )

        rtt[event_start:event_end] = np.clip(rtt[event_start:event_end] * 3.0, 1.0, 800.0)
        plr[event_start:event_end] = np.clip(plr[event_start:event_end] * 5.0, 0.0, 0.5)

        label_start = max(0, event_start - CONGESTION_LOOKAHEAD)
        congestion_onset[label_start:event_start] = 1.0

    available_bitrate = np.clip(throughput * (1.0 - plr) * 0.9, 50.0, MAX_TARGET_BITRATE_KBPS)
    jitter = np.clip(rtt * 0.15 + rng.normal(0.0, 5.0, size=SESSION_LENGTH), 0.0, 200.0)
    fps = np.clip(30.0 - plr * 100.0 - np.maximum(0.0, rtt - 150.0) * 0.05, 5.0, 30.0)
    freeze_occurred = ((plr > 0.08) | (rtt > 350.0)).astype(np.float32)

    features = np.stack(
        [
            rtt.astype(np.float32),
            jitter.astype(np.float32),
            plr.astype(np.float32),
            available_bitrate.astype(np.float32),
            fps.astype(np.float32),
            freeze_occurred.astype(np.float32),
        ],
        axis=-1,
    )

    next_bitrate = next_bitrate_label(available_bitrate.astype(np.float32))
    return features, congestion_onset.astype(np.float32), next_bitrate.astype(np.float32)


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(42)

    features = np.zeros((NUM_SESSIONS, SESSION_LENGTH, FEATURE_COUNT), dtype=np.float32)
    congestion_labels = np.zeros((NUM_SESSIONS, SESSION_LENGTH), dtype=np.float32)
    bitrate_labels = np.zeros((NUM_SESSIONS, SESSION_LENGTH), dtype=np.float32)
    profile_ids = np.zeros((NUM_SESSIONS,), dtype=np.int32)

    for session_idx in tqdm(range(NUM_SESSIONS), desc="Generating synthetic WebRTC sessions"):
        profile = sample_profile(rng)
        session_features, session_congestion, session_bitrate = generate_session(rng, profile)
        features[session_idx] = session_features
        congestion_labels[session_idx] = session_congestion
        bitrate_labels[session_idx] = session_bitrate
        profile_ids[session_idx] = next(index for index, candidate in enumerate(NETWORK_PROFILES) if candidate.name == profile.name)

    with h5py.File(OUTPUT_PATH, "w") as h5_file:
        h5_file.create_dataset("features", data=features, compression="gzip")
        h5_file.create_dataset("congestion_onset", data=congestion_labels, compression="gzip")
        h5_file.create_dataset("next_bitrate", data=bitrate_labels, compression="gzip")
        h5_file.create_dataset(
            "profile_names",
            data=np.array([profile.name.encode("utf-8") for profile in NETWORK_PROFILES]),
        )
        h5_file.create_dataset("profile_ids", data=profile_ids)

    print(f"Saved synthetic dataset to: {OUTPUT_PATH}")
    print(f"features shape: {features.shape}")
    print(f"congestion_onset shape: {congestion_labels.shape}")
    print(f"next_bitrate shape: {bitrate_labels.shape}")


if __name__ == "__main__":
    main()
