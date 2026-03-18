"""
inference/metrics.py
QoE metrics engine for post-aggregation evaluation.

Called by bridge._aggregate() after every FL round.
Evaluates the global model against Atlas streaming_logs and
saves comprehensive metrics to fl_rounds collection.

Metrics: MAE, RMSE, bucket_accuracy, abr_accuracy,
         bad_qoe_f1, adaptive_changes, mean_pred_qoe
"""

import numpy as np
import torch
from sklearn.preprocessing import StandardScaler
from inference.mongo_reader import fetch_for_eval, save_round_metrics
from inference.models.qoe_net import QoENet, set_parameters

FEATURE_COLS = ["bitrate", "buffer_ratio", "latency", "rebuffering", "bitrate_switch"]


def compute_and_save(aggregated_weights: list, round_num: int) -> dict:
    """
    Post-aggregation server-side evaluation.
    Fetches data from Atlas, evaluates global model, saves metrics.
    Called by bridge._aggregate() after every FL round.
    """
    try:
        df = fetch_for_eval(limit=2000)
        scaler = StandardScaler()
        X = scaler.fit_transform(df[FEATURE_COLS].values)
        y = df["qoe_score"].values

        model = QoENet()
        model = set_parameters(model, aggregated_weights)
        model.eval()

        with torch.no_grad():
            preds = model(torch.FloatTensor(X)).numpy().flatten()

        # Core metrics
        mae = float(np.mean(np.abs(y - preds)))
        rmse = float(np.sqrt(np.mean((y - preds) ** 2)))

        # QoE bucket accuracy (Low/Medium/High)
        def bucket(s):
            return 0 if s < 0.4 else (1 if s < 0.7 else 2)

        bucket_acc = float(
            np.mean([bucket(t) == bucket(p) for t, p in zip(y, preds)])
        )

        # ABR recommendation accuracy — core MobCloudX objective
        def abr(s):
            return "dec" if s < 0.4 else ("maint" if s < 0.7 else "inc")

        abr_acc = float(np.mean([abr(t) == abr(p) for t, p in zip(y, preds)]))

        # Adaptive change detection
        adaptive_changes = int(np.sum(np.abs(np.diff(preds)) > 0.05))

        # Bad QoE F1
        bad_t = (y < 0.4).astype(int)
        bad_p = (preds < 0.4).astype(int)
        tp = np.sum((bad_t == 1) & (bad_p == 1))
        fp = np.sum((bad_t == 0) & (bad_p == 1))
        fn = np.sum((bad_t == 1) & (bad_p == 0))
        f1 = float(2 * tp / (2 * tp + fp + fn + 1e-8))

        result = {
            "round": round_num,
            "mae": round(mae, 4),
            "rmse": round(rmse, 4),
            "bucket_accuracy": round(bucket_acc, 4),
            "abr_accuracy": round(abr_acc, 4),
            "bad_qoe_f1": round(f1, 4),
            "adaptive_changes": adaptive_changes,
            "mean_pred_qoe": round(float(np.mean(preds)), 4),
            "samples_evaluated": len(y),
        }

        print(f"\n[Metrics] Round {round_num}:")
        for k, v in result.items():
            if k not in ("round", "samples_evaluated"):
                bar = "█" * int(v * 12) if isinstance(v, float) and 0 <= v <= 1 else ""
                print(f"  {k:<22} {str(v):<10} {bar}")

        save_round_metrics(round_num, result)
        return result

    except Exception as e:
        print(f"[Metrics] Error round {round_num}: {e}")
        return {"round": round_num, "error": str(e)}
