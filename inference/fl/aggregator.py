"""
inference/fl/aggregator.py
FedAvg aggregation engine for MobCloudX FL.

Implements weighted-average model aggregation proportional to
num_samples per client. Also provides initial weight generation
matching QoENet architecture (5→64→32→16→1).
"""

import numpy as np
from typing import Dict, List, Any


def fedavg(
    device_weights: Dict[str, List[List[float]]],
    device_meta: Dict[str, Dict[str, Any]],
) -> List[np.ndarray]:
    """
    FedAvg: weighted average proportional to num_samples per client.
    Returns aggregated weight arrays ready for broadcast.
    """
    total = sum(m["num_samples"] for m in device_meta.values())
    if total == 0:
        raise ValueError("Total samples is 0 — cannot aggregate")

    agg: List[np.ndarray] | None = None

    for dev_id, weights in device_weights.items():
        n = device_meta[dev_id]["num_samples"]
        factor = n / total
        scaled = [np.array(layer, dtype=np.float32) * factor for layer in weights]
        agg = scaled if agg is None else [a + b for a, b in zip(agg, scaled)]

    return agg  # type: ignore


def make_initial_weights() -> List[List[float]]:
    """
    Random init weights matching QoENet: 5→64→32→16→1
    8 tensors: W+b per layer.
    Must match WEIGHT_SHAPES in qoe_net.py exactly.
    """
    shapes = [(5, 64), (64,), (64, 32), (32,), (32, 16), (16,), (16, 1), (1,)]
    return [
        (np.random.randn(*s).astype(np.float32) * 0.05).tolist() for s in shapes
    ]
