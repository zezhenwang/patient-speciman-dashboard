import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

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

    wide = (
        df.pivot_table(
            index="order_test_id",
            columns="event_type",
            values="event_dt",
            aggfunc="min"
        )
        .reset_index()
    )

    orders = base.merge(wide, on="order_test_id", how="left")
    orders["order_dt"] = orders["test_ordered_dt"]

    for label, col in TIMELINE.items():
        orders[f"{label}_hours"] = (orders[col] - orders["order_dt"]).dt.total_seconds() / 3600

    return orders


def filter_cohort(orders, test_code=None, street=None):
    out = orders.copy()
    if test_code:
        out = out[out["test_code"] == test_code]
    if street:
        out = out[out["order_street"] == street]
    out = out[out["order_dt"].notna()].copy()
    return out


def build_progress(cohort, step=1, max_hours=120):
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


def plot_progress(progress, output_path):
    plt.figure(figsize=(10, 6))
    for label in TIMELINE:
        plt.plot(progress["hours"], progress[label], label=label, linewidth=2)

    plt.xlabel("Hours since order")
    plt.ylabel("Share reached")
    plt.title("Part 1 Average Workflow")
    plt.ylim(0, 1.05)
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close()


if __name__ == "__main__":
    df = read_data("2025_specimen_time_series_events_no_phi.zip")

    orders = build_order_table(df)
    cohort = filter_cohort(orders, test_code="25HD", street="Medical")

    progress = build_progress(cohort, step=1, max_hours=120)

    Path("output").mkdir(exist_ok=True)
    progress.to_csv("output/part1_progress.csv", index=False)
    plot_progress(progress, "output/part1_workflow.png")
