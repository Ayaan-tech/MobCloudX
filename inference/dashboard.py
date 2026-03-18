"""
inference/dashboard.py
Post-training 4+1 panel matplotlib dashboard for FL metrics.

Reads fl_rounds from Atlas (or fallback JSON) and creates:
  Panel 1: QoE MAE / Round — line chart
  Panel 2: ABR Accuracy / Round — line chart
  Panel 3: MAE improvement Δ — bar chart
  Panel 4: Adaptive Changes / Round — line chart
  Panel 5: Summary text box

Run: python -m inference.dashboard
Output: qoe_dashboard.png (DPI 150)
"""

import os
import json
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

# Dark theme
BG = "#0d1117"
FG = "#c9d1d9"
GRID = "#21262d"
MAE_COLOR = "#ff6b6b"
ABR_COLOR = "#ffe66d"
CHANGE_COLOR = "#4ecdc4"
IMPROVE_COLOR = "#00ff88"
WORSE_COLOR = "#ff6b6b"


def load_data() -> list:
    """Load round metrics from Atlas or fallback JSON."""
    try:
        from inference.mongo_reader import get_all_round_metrics

        data = get_all_round_metrics()
        if data:
            return data
    except Exception as e:
        print(f"[Dashboard] Atlas unavailable: {e}")

    fallback = os.path.join(os.path.dirname(__file__), "round_metrics.json")
    if os.path.exists(fallback):
        with open(fallback) as f:
            return json.load(f)

    print("[Dashboard] No data available — using synthetic demo data")
    return [
        {
            "round": i + 1,
            "mae": max(0.05, 0.35 - i * 0.03 + np.random.randn() * 0.01),
            "rmse": max(0.08, 0.42 - i * 0.035 + np.random.randn() * 0.01),
            "bucket_accuracy": min(0.95, 0.45 + i * 0.05 + np.random.randn() * 0.02),
            "abr_accuracy": min(0.95, 0.42 + i * 0.055 + np.random.randn() * 0.02),
            "bad_qoe_f1": min(0.9, 0.3 + i * 0.06),
            "adaptive_changes": max(0, int(80 - i * 5 + np.random.randn() * 3)),
            "mean_pred_qoe": 0.55 + i * 0.02,
            "samples_evaluated": 500,
        }
        for i in range(10)
    ]


def make_dashboard():
    data = load_data()
    if not data:
        print("[Dashboard] No FL round data to plot")
        return

    rounds = [d["round"] for d in data]
    maes = [d.get("mae", 0) for d in data]
    abr_accs = [d.get("abr_accuracy", 0) for d in data]
    changes = [d.get("adaptive_changes", 0) for d in data]

    # MAE deltas
    deltas = [0] + [maes[i - 1] - maes[i] for i in range(1, len(maes))]
    delta_colors = [IMPROVE_COLOR if d > 0 else WORSE_COLOR for d in deltas]

    fig = plt.figure(figsize=(18, 10), facecolor=BG)
    fig.suptitle(
        "MobCloudX Federated QoE — Training Dashboard",
        color=FG,
        fontsize=18,
        fontweight="bold",
        y=0.97,
    )

    gs = fig.add_gridspec(2, 3, hspace=0.35, wspace=0.3, left=0.06, right=0.97, top=0.9, bottom=0.08)

    # ── Panel 1: MAE / Round ──────────────────────────────────
    ax1 = fig.add_subplot(gs[0, 0])
    ax1.set_facecolor(BG)
    ax1.plot(rounds, maes, "-o", color=MAE_COLOR, markersize=6, linewidth=2.5)
    ax1.fill_between(rounds, maes, alpha=0.15, color=MAE_COLOR)
    ax1.set_title("QoE MAE / Round", color=FG, fontsize=13)
    ax1.set_xlabel("FL Round", color=FG)
    ax1.set_ylabel("MAE", color=FG)
    ax1.tick_params(colors=FG)
    ax1.grid(True, color=GRID, alpha=0.5)
    for spine in ax1.spines.values():
        spine.set_color(GRID)

    # ── Panel 2: ABR Accuracy / Round ─────────────────────────
    ax2 = fig.add_subplot(gs[0, 1])
    ax2.set_facecolor(BG)
    ax2.plot(rounds, abr_accs, "-s", color=ABR_COLOR, markersize=6, linewidth=2.5)
    ax2.fill_between(rounds, abr_accs, alpha=0.15, color=ABR_COLOR)
    ax2.set_title("ABR Accuracy / Round", color=FG, fontsize=13)
    ax2.set_xlabel("FL Round", color=FG)
    ax2.set_ylabel("Accuracy", color=FG)
    ax2.tick_params(colors=FG)
    ax2.grid(True, color=GRID, alpha=0.5)
    ax2.set_ylim(0, 1.05)
    for spine in ax2.spines.values():
        spine.set_color(GRID)

    # ── Panel 3: MAE Δ (improvement bar chart) ────────────────
    ax3 = fig.add_subplot(gs[0, 2])
    ax3.set_facecolor(BG)
    ax3.bar(rounds, deltas, color=delta_colors, edgecolor="none", width=0.7)
    ax3.axhline(0, color=FG, linewidth=0.8, alpha=0.5)
    ax3.set_title("MAE Improvement Δ / Round", color=FG, fontsize=13)
    ax3.set_xlabel("FL Round", color=FG)
    ax3.set_ylabel("Δ MAE", color=FG)
    ax3.tick_params(colors=FG)
    ax3.grid(True, color=GRID, alpha=0.5, axis="y")
    improve_patch = mpatches.Patch(color=IMPROVE_COLOR, label="Improved")
    worse_patch = mpatches.Patch(color=WORSE_COLOR, label="Worsened")
    ax3.legend(handles=[improve_patch, worse_patch], loc="upper right", fontsize=8, facecolor=BG, edgecolor=GRID, labelcolor=FG)
    for spine in ax3.spines.values():
        spine.set_color(GRID)

    # ── Panel 4: Adaptive Changes / Round ─────────────────────
    ax4 = fig.add_subplot(gs[1, 0])
    ax4.set_facecolor(BG)
    ax4.plot(rounds, changes, "-D", color=CHANGE_COLOR, markersize=6, linewidth=2.5)
    ax4.fill_between(rounds, changes, alpha=0.15, color=CHANGE_COLOR)
    ax4.set_title("Adaptive Changes / Round", color=FG, fontsize=13)
    ax4.set_xlabel("FL Round", color=FG)
    ax4.set_ylabel("# Changes", color=FG)
    ax4.tick_params(colors=FG)
    ax4.grid(True, color=GRID, alpha=0.5)
    for spine in ax4.spines.values():
        spine.set_color(GRID)

    # ── Panel 5: Summary text box ─────────────────────────────
    ax5 = fig.add_subplot(gs[1, 1:])
    ax5.set_facecolor(BG)
    ax5.axis("off")

    total_rounds = len(rounds)
    initial_mae = maes[0] if maes else 0
    final_mae = maes[-1] if maes else 0
    best_mae = min(maes) if maes else 0
    best_round = rounds[maes.index(best_mae)] if maes else 0
    reduction_pct = ((initial_mae - final_mae) / initial_mae * 100) if initial_mae > 0 else 0
    final_abr = abr_accs[-1] if abr_accs else 0
    total_changes = sum(changes)

    summary = (
        f"╔══ MobCloudX FL Training Summary ════════════════════════╗\n"
        f"║                                                         ║\n"
        f"║  Total FL Rounds:        {total_rounds:<10}                     ║\n"
        f"║  Initial MAE:            {initial_mae:<10.4f}                     ║\n"
        f"║  Final MAE:              {final_mae:<10.4f}                     ║\n"
        f"║  Best MAE:               {best_mae:<10.4f}  (round {best_round})           ║\n"
        f"║  MAE Reduction:          {reduction_pct:<10.1f}%                    ║\n"
        f"║  Final ABR Accuracy:     {final_abr:<10.4f}                     ║\n"
        f"║  Total Adaptive Changes: {total_changes:<10}                     ║\n"
        f"║                                                         ║\n"
        f"║  Stack: Expo TF.js + FastAPI · MongoDB Atlas            ║\n"
        f"║  Fields: session_id · buffer_health                     ║\n"
        f"║  Model: QoENet 5→64→32→16→1 (PyTorch + TF.js)          ║\n"
        f"╚═════════════════════════════════════════════════════════╝"
    )

    ax5.text(
        0.05, 0.95, summary,
        transform=ax5.transAxes,
        fontsize=11,
        fontfamily="monospace",
        color="#58a6ff",
        verticalalignment="top",
        bbox=dict(boxstyle="round,pad=0.8", facecolor="#161b22", edgecolor="#30363d"),
    )

    output_path = os.path.join(os.path.dirname(__file__), "..", "qoe_dashboard.png")
    plt.savefig(output_path, dpi=150, facecolor=BG, bbox_inches="tight")
    print(f"[Dashboard] Saved → {os.path.abspath(output_path)}")
    plt.close()


if __name__ == "__main__":
    make_dashboard()
