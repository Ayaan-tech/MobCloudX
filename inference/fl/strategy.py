"""
inference/fl/strategy.py
QoEFedAvgStrategy — Custom FedAvg strategy for MobCloudX.

Wraps aggregator.fedavg with round-lifecycle hooks:
logging, LR scheduling, and convergence checks.
"""

from typing import Dict, List, Any, Optional
from inference.fl.aggregator import fedavg, make_initial_weights


class QoEFedAvgStrategy:
    """
    Custom FedAvg strategy for QoE model aggregation.
    Manages round lifecycle, LR scheduling, and convergence tracking.
    """

    def __init__(self, min_clients: int = 2, num_rounds: int = 10):
        self.min_clients = min_clients
        self.num_rounds = num_rounds
        self.round_losses: List[float] = []

    def get_lr(self, round_num: int) -> float:
        """LR decay schedule: 0.001 for rounds 1-5, 0.0005 for rounds 6+."""
        return 0.001 if round_num <= 5 else 0.0005

    def get_config(self, round_num: int) -> dict:
        """Training config broadcast to all clients."""
        return {
            "lr": self.get_lr(round_num),
            "epochs": 3,
            "batch_size": 16,
        }

    def should_aggregate(self, n_ready: int) -> bool:
        """Check if enough clients have submitted for aggregation."""
        return n_ready >= self.min_clients

    def aggregate(
        self,
        device_weights: Dict[str, List[List[float]]],
        device_meta: Dict[str, Dict[str, Any]],
    ) -> List:
        """Run FedAvg aggregation."""
        agg = fedavg(device_weights, device_meta)

        # Track average client loss for convergence monitoring
        avg_loss = sum(m.get("train_loss", 0) for m in device_meta.values()) / max(
            len(device_meta), 1
        )
        self.round_losses.append(avg_loss)

        return agg

    def has_converged(self, window: int = 3, threshold: float = 0.005) -> bool:
        """Simple convergence check: loss improvement < threshold over last N rounds."""
        if len(self.round_losses) < window + 1:
            return False
        recent = self.round_losses[-window:]
        older = self.round_losses[-(window + 1)]
        improvement = older - sum(recent) / len(recent)
        return abs(improvement) < threshold
