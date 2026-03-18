"""
inference/models/qoe_net.py
QoE prediction network for MobCloudX Federated Learning.

Architecture: 5 → 64 → 32 → 16 → 1
Output: QoE score ∈ [0, 1] (sigmoid)
Identical structure to TF.js client model in src/fl/qoeModel.ts
"""

import torch
import torch.nn as nn
import numpy as np
from collections import OrderedDict
from typing import List


class QoENet(nn.Module):
    """
    QoE prediction network for MobCloudX.
    Architecture: 5 → 64 → 32 → 16 → 1
    Output: QoE score ∈ [0, 1] (sigmoid)
    Identical structure to TF.js client model in src/fl/qoeModel.ts
    """

    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(5, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def get_parameters(model: QoENet) -> List[np.ndarray]:
    """Extract model weights as numpy arrays for FL transmission."""
    return [val.cpu().numpy() for _, val in model.state_dict().items()]


def set_parameters(model: QoENet, parameters: List[np.ndarray]) -> QoENet:
    """Load numpy weight arrays into model (received from FL aggregation)."""
    state_dict = OrderedDict(
        {k: torch.tensor(v) for k, v in zip(model.state_dict().keys(), parameters)}
    )
    model.load_state_dict(state_dict, strict=True)
    return model


# Training hyperparameters — do not change without updating Expo qoeModel.ts
TRAINING_CONFIG = {
    "loss": nn.MSELoss,
    "optimizer": "adam",
    "lr_initial": 0.001,  # rounds 1–5
    "lr_decayed": 0.0005,  # rounds 6+
    "batch_size": 16,  # mobile-safe RAM constraint
    "local_epochs": 3,  # battery conservative
    "weight_decay": 1e-4,  # L2 reg against non-IID drift
}

# Weight tensor layout — must match TF.js client exactly
# 8 tensors: [W1(5,64), b1(64), W2(64,32), b2(32),
#              W3(32,16), b3(16), W4(16,1),  b4(1)]
WEIGHT_SHAPES = [(5, 64), (64,), (64, 32), (32,), (32, 16), (16,), (16, 1), (1,)]
