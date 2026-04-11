#!/usr/bin/env python3
"""Build compact order-level JSON for the static Plotly dashboard."""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Optional
import zipfile

MILESTONE_RULES = {
    "test_ordered_dt": ("order_ts", "min"),
    "test_collected_dt": ("collected_ts", "min"),
    "test_receipt_dt": ("received_ts", "min"),
    "test_min_resulted_dt": ("first_result_ts", "min"),
    "test_max_verified_dt": ("final_verified_ts", "max"),
    "cancellation_dt": ("cancellation_ts", "min"),
}

FOCUS_WINDOWS_HOURS = [6, 72]

FIELDS = [
    "test_code",
    "order_street",
    "test_performing_dept",
    "test_performing_location",
    "day_type",
    "order_unix_s",
    "collected_s",
    "received_s",
    "first_result_s",
    "final_verified_s",
    "cancellation_s",
    "collected_h",
    "received_h",
    "first_result_h",
    "final_verified_h",
    "cancellation_h",
    "is_cancelled",
]


@dataclass
class OrderState:
    test_code: str
    order_street: str
    test_performing_dept: str
    test_performing_location: str
    order_ts: Optional[int] = None
    collected_ts: Optional[int] = None
    received_ts: Optional[int] = None
    first_result_ts: Optional[int] = None
    final_verified_ts: Optional[int] = None
    cancellation_ts: Optional[int] = None


def parse_ts(raw: str) -> Optional[int]:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return int(dt.timestamp())


def pick_tsv_member(zip_path: Path) -> str:
    with zipfile.ZipFile(zip_path) as zf:
        for name in zf.namelist():
            if name.lower().endswith(".tsv"):
                return name
    raise FileNotFoundError("No .tsv member found inside zip")


def read_rows(zip_path: Path, member: str) -> Iterable[dict]:
    with zipfile.ZipFile(zip_path) as zf, zf.open(member) as fh:
        text = (line.decode("utf-8", "replace") for line in fh)
        reader = csv.DictReader(text, delimiter="\t")
        for row in reader:
            yield row


def to_seconds(base_ts: int, event_ts: Optional[int]) -> Optional[int]:
    if event_ts is None:
        return None
    delta_s = event_ts - base_ts
    if delta_s < 0:
        return None
    return int(delta_s)


def seconds_to_hours(seconds: Optional[int]) -> Optional[float]:
    if seconds is None:
        return None
    # Preserve fine timing (second-level) in hour units.
    return round(seconds / 3600.0, 6)


def build_compact_dataset(zip_path: Path, member: str) -> dict:
    orders: Dict[str, OrderState] = {}

    source_counter = Counter()
    event_counter = Counter()

    for row in read_rows(zip_path, member):
        source = row.get("event_source", "")
        source_counter[source] += 1
        if source != "order":
            continue

        accession_id = (row.get("accession_id") or "").strip()
        test_code = (row.get("test_code") or "").strip()
        event_type = (row.get("event_type") or "").strip()

        if not accession_id or not test_code:
            continue

        key = f"{accession_id}||{test_code}"
        state = orders.get(key)
        if state is None:
            state = OrderState(
                test_code=test_code,
                order_street=(row.get("event_street") or "Unknown").strip() or "Unknown",
                test_performing_dept=(row.get("test_performing_dept") or "Unknown").strip() or "Unknown",
                test_performing_location=(row.get("test_performing_location") or "Unknown").strip() or "Unknown",
            )
            orders[key] = state

        # Keep first non-empty dimensional values if some rows are sparse.
        if state.order_street == "Unknown" and row.get("event_street"):
            state.order_street = row["event_street"].strip() or "Unknown"
        if state.test_performing_dept == "Unknown" and row.get("test_performing_dept"):
            state.test_performing_dept = row["test_performing_dept"].strip() or "Unknown"
        if state.test_performing_location == "Unknown" and row.get("test_performing_location"):
            state.test_performing_location = row["test_performing_location"].strip() or "Unknown"

        rule = MILESTONE_RULES.get(event_type)
        if rule is None:
            continue

        event_counter[event_type] += 1
        ts = parse_ts((row.get("event_dt") or "").strip())
        if ts is None:
            continue

        attr, strategy = rule
        current = getattr(state, attr)

        if current is None:
            setattr(state, attr, ts)
        elif strategy == "min" and ts < current:
            setattr(state, attr, ts)
        elif strategy == "max" and ts > current:
            setattr(state, attr, ts)

    records = []
    dimension_values = {
        "test_code": set(),
        "order_street": set(),
        "test_performing_dept": set(),
        "test_performing_location": set(),
        "day_type": {"Weekday", "Weekend"},
    }

    dropped_without_order = 0

    for state in orders.values():
        if state.order_ts is None:
            dropped_without_order += 1
            continue

        order_dt = datetime.fromtimestamp(state.order_ts, tz=timezone.utc)
        day_type = "Weekend" if order_dt.weekday() >= 5 else "Weekday"

        collected_s = to_seconds(state.order_ts, state.collected_ts)
        received_s = to_seconds(state.order_ts, state.received_ts)
        first_result_s = to_seconds(state.order_ts, state.first_result_ts)
        final_verified_s = to_seconds(state.order_ts, state.final_verified_ts)
        cancellation_s = to_seconds(state.order_ts, state.cancellation_ts)

        collected_h = seconds_to_hours(collected_s)
        received_h = seconds_to_hours(received_s)
        first_result_h = seconds_to_hours(first_result_s)
        final_verified_h = seconds_to_hours(final_verified_s)
        cancellation_h = seconds_to_hours(cancellation_s)
        is_cancelled = 1 if cancellation_h is not None else 0

        records.append(
            [
                state.test_code,
                state.order_street,
                state.test_performing_dept,
                state.test_performing_location,
                day_type,
                state.order_ts,
                collected_s,
                received_s,
                first_result_s,
                final_verified_s,
                cancellation_s,
                collected_h,
                received_h,
                first_result_h,
                final_verified_h,
                cancellation_h,
                is_cancelled,
            ]
        )

        dimension_values["test_code"].add(state.test_code)
        dimension_values["order_street"].add(state.order_street)
        dimension_values["test_performing_dept"].add(state.test_performing_dept)
        dimension_values["test_performing_location"].add(state.test_performing_location)

    summary = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_zip": str(zip_path.name),
        "source_member": member,
        "focus_windows_hours": FOCUS_WINDOWS_HOURS,
        "time_precision_hours_decimals": 6,
        "time_precision_seconds": True,
        "fields": FIELDS,
        "dimensions": {k: sorted(v) for k, v in dimension_values.items()},
        "records": records,
        "stats": {
            "raw_source_counts": dict(source_counter),
            "tracked_event_counts": dict(event_counter),
            "order_test_records": len(orders),
            "records_in_dashboard": len(records),
            "dropped_without_order": dropped_without_order,
        },
    }
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Build dashboard JSON from specimen event ZIP")
    parser.add_argument(
        "--input",
        default="2025_specimen_time_series_events_no_phi.zip",
        help="Path to ZIP file containing TSV event extract",
    )
    parser.add_argument(
        "--member",
        default=None,
        help="TSV member name inside zip (optional)",
    )
    parser.add_argument(
        "--output",
        default="dashboard/data/orders_compact.json",
        help="Output JSON path",
    )
    args = parser.parse_args()

    zip_path = Path(args.input)
    if not zip_path.exists():
        raise FileNotFoundError(f"Input ZIP not found: {zip_path}")

    member = args.member or pick_tsv_member(zip_path)
    dataset = build_compact_dataset(zip_path, member)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {output_path} ({output_path.stat().st_size / 1024 / 1024:.2f} MB)")
    print("Dashboard records:", dataset["stats"]["records_in_dashboard"])


if __name__ == "__main__":
    main()
