import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter, MultipleLocator
from pathlib import Path

COLORS = {
    "Ordered": "#9AA0A6",
    "Collected": "#F58518",
    "Received": "#54A24B",
    "First Result": "#E45756",
    "Final Verified": "#7E57C2",
}

TIMELINE = {
    "Ordered": "test_ordered_dt",
    "Collected": "test_collected_dt",
    "Received": "test_receipt_dt",
    "First Result": "test_min_resulted_dt",
    "Final Verified": "test_max_verified_dt",
}


def read_data(zip_path):
    cols = [
        "accession_id",
        "test_code",
        "test_performing_dept",
        "test_performing_location",
        "event_street",
        "event_source",
        "event_type",
        "event_dt",
    ]

    df = pd.read_csv(zip_path, sep="\t", compression="zip", usecols=cols, low_memory=False)
    df = df[df["event_source"] == "order"].copy()
    df["event_dt"] = pd.to_datetime(df["event_dt"], utc=True, errors="coerce")
    df = df.dropna(subset=["accession_id", "test_code", "event_type", "event_dt"])
    df["order_test_id"] = df["accession_id"].astype(str) + "||" + df["test_code"].astype(str)
    return df


def build_order_table(df):
    base = (
        df.sort_values(["order_test_id", "event_dt"])
          .drop_duplicates("order_test_id")
          [["order_test_id", "accession_id", "test_code", "test_performing_dept", "test_performing_location", "event_street"]]
          .rename(columns={"event_street": "order_street"})
    )

    min_events = [
        "test_ordered_dt",
        "test_collected_dt",
        "test_receipt_dt",
        "test_min_resulted_dt",
        "test_min_verified_dt",
        "cancellation_dt",
    ]
    max_events = [
        "test_max_resulted_dt",
        "test_max_verified_dt",
    ]

    wide_min = (
        df[df["event_type"].isin(min_events)]
        .pivot_table(
            index="order_test_id",
            columns="event_type",
            values="event_dt",
            aggfunc="min"
        )
    )

    wide_max = (
        df[df["event_type"].isin(max_events)]
        .pivot_table(
            index="order_test_id",
            columns="event_type",
            values="event_dt",
            aggfunc="max"
        )
    )

    wide = wide_min.join(wide_max, how="outer").reset_index()

    orders = base.merge(wide, on="order_test_id", how="left")
    orders["order_dt"] = orders["test_ordered_dt"]

    for label, col in TIMELINE.items():
        orders[f"{label}_hours"] = (orders[col] - orders["order_dt"]).dt.total_seconds() / 3600

    return orders

def summarize_milestones(cohort):
    rows = []
    n = len(cohort)

    for label in TIMELINE:
        vals = cohort[f"{label}_hours"].dropna().to_numpy()
        vals = vals[np.isfinite(vals)]
        vals = vals[vals >= 0]

        rows.append({
            "milestone": label,
            "n_done": len(vals),
            "completion_rate": len(vals) / n if n else 0,
            "median_hours": float(np.median(vals)) if len(vals) else np.nan,
        })

    return pd.DataFrame(rows)


def determine_max_hours(cohort, user_max_hours=None):
    if user_max_hours is not None:
        return float(user_max_hours)

    if "Final Verified_hours" in cohort.columns:
        vals = cohort["Final Verified_hours"].dropna().to_numpy()
        vals = vals[np.isfinite(vals)]
        vals = vals[vals >= 0]
        if len(vals):
            return float(np.ceil(np.percentile(vals, 95) + 2))

    cols = [f"{label}_hours" for label in TIMELINE if label != "Ordered"]
    vals = cohort[cols].to_numpy(dtype=float).ravel()
    vals = vals[np.isfinite(vals)]
    vals = vals[vals >= 0]

    if len(vals) == 0:
        return 24.0

    return float(np.ceil(np.percentile(vals, 95) + 2))

def filter_cohort(orders, test_code=None, street=None):
    out = orders.copy()
    if test_code:
        out = out[out["test_code"] == test_code]
    if street:
        out = out[out["order_street"] == street]
    out = out[out["order_dt"].notna()].copy()
    return out


def build_progress(cohort, step=1, max_hours=120):
    max_hours = determine_max_hours(cohort, max_hours)
    hours = np.arange(0, max_hours + step, step)
    progress = pd.DataFrame({"hours": hours})
    n = len(cohort)

    for label in TIMELINE:
        if label == "Ordered":
            progress[label] = 1.0
            continue

        vals = cohort[f"{label}_hours"].dropna().to_numpy()
        vals = vals[np.isfinite(vals)]
        vals = vals[vals >= 0]
        vals.sort()
        progress[label] = np.searchsorted(vals, hours, side="right") / n

    return progress


def plot_progress(progress, milestone_summary, output_path, cohort_label="", cohort_n=None):
    fig, ax = plt.subplots(figsize=(11.5, 6.5), facecolor="white")
    ax.set_facecolor("white")

    max_h = float(progress["hours"].max())
    n_days = int(np.ceil(max_h / 24))

    for day in range(n_days):
        left = day * 24
        right = min((day + 1) * 24, max_h)

        if day % 2 == 0:
            ax.axvspan(left, right, color="#F7F9FC", zorder=0)

        ax.axvline(left, color="#E5E7EB", linewidth=0.8, zorder=1)

        ax.text(
            (left + right) / 2,
            1.02,
            f"Day {day + 1}",
            transform=ax.get_xaxis_transform(),
            ha="center",
            va="bottom",
            fontsize=9,
            color="#6B7280",
        )

    for label in TIMELINE:
        if label == "Ordered":
            ax.plot(
                progress["hours"],
                progress[label],
                label=label,
                color=COLORS[label],
                linewidth=1.8,
                linestyle="--",
                alpha=0.9,
                zorder=3,
            )
        else:
            ax.plot(
                progress["hours"],
                progress[label],
                label=label,
                color=COLORS[label],
                linewidth=3,
                solid_capstyle="round",
                zorder=4,
            )

    for _, row in milestone_summary.iterrows():
        label = row["milestone"]
        if label == "Ordered":
            continue
        if pd.notna(row["median_hours"]):
            ax.axvline(
                row["median_hours"],
                color=COLORS[label],
                linestyle=":",
                linewidth=1.2,
                alpha=0.35,
                zorder=2,
            )

    ax.set_xlim(0, max_h)
    ax.set_ylim(0, 1.03)

    ax.set_xlabel("Hours since order", fontsize=11)
    ax.set_ylabel("Share of cohort", fontsize=11)
    ax.yaxis.set_major_formatter(PercentFormatter(1.0))
    ax.xaxis.set_major_locator(MultipleLocator(12))

    ax.grid(axis="y", color="#D1D5DB", alpha=0.6, linewidth=0.8)
    ax.grid(axis="x", visible=False)

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#D1D5DB")
    ax.spines["bottom"].set_color("#D1D5DB")

    ax.set_title("Part 1 Average Workflow", loc="left", fontsize=18, weight="bold", pad=24)

    subtitle = []
    if cohort_n is not None:
        subtitle.append(f"N = {cohort_n:,}")
    if cohort_label:
        subtitle.append(cohort_label)

    if subtitle:
        ax.text(
            0,
            1.08,
            " | ".join(subtitle),
            transform=ax.transAxes,
            ha="left",
            va="bottom",
            fontsize=10,
            color="#6B7280",
        )

    summary_lines = []
    for _, row in milestone_summary.iterrows():
        if row["milestone"] == "Ordered":
            continue
        if pd.notna(row["median_hours"]):
            summary_lines.append(f"{row['milestone']}: {row['median_hours']:.1f}h")

    if summary_lines:
        ax.text(
            0.99,
            0.02,
            "\n".join(summary_lines),
            transform=ax.transAxes,
            ha="right",
            va="bottom",
            fontsize=9,
            color="#374151",
            bbox=dict(boxstyle="round,pad=0.35", facecolor="white", edgecolor="#E5E7EB"),
        )

    legend = ax.legend(loc="lower right", frameon=False, ncol=2)
    for line in legend.get_lines():
        line.set_linewidth(3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=220, bbox_inches="tight")
    plt.close()

if __name__ == "__main__":
    df = read_data("2025_specimen_time_series_events_no_phi.zip")

    orders = build_order_table(df)
    cohort = filter_cohort(orders, test_code="25HD", street="Medical")

    progress = build_progress(cohort, step=0.5, max_hours=None)
    milestone_summary = summarize_milestones(cohort)

    plot_progress(
        progress,
        milestone_summary,
        "output/part1_workflow.png",
        cohort_label="test_code = 25HD | street = Medical",
        cohort_n=len(cohort),
    )