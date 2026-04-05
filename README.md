# patient-speciman-dashboard

Static Plotly dashboard for specimen workflow timelines and cohort comparison.

## Build Dashboard Data

```bash
python3 scripts/build_dashboard_data.py \
  --input 2025_specimen_time_series_events_no_phi.zip \
  --output dashboard/data/orders_compact.json
```

This generates compact order-level data consumed by the static dashboard.

## Run Dashboard Locally

```bash
python3 -m http.server 8000 --directory dashboard
```

Open `http://127.0.0.1:8000`.

## Implemented Features

- Dimensional filtering for workflow timeline:
  - `test_code`
  - `order_street`
  - `test_performing_dept`
  - `test_performing_location`
  - `day_type` (`Weekday` / `Weekend`)
- `Comparison` button:
  - creates side-by-side comparison panel
  - initializes comparison panel with the same filters as the primary panel
  - each panel can then be adjusted independently
- Likeliness of cancellation:
  - shown as a gray timeline line
  - global clickbox to hide/show cancellation visuals
- Additional charts per cohort panel:
  - Flowchart of samples between stages (Sankey)
  - ThemeRiver-style chart using individual event counts per hour (not accumulated occupancy), with log-scaled y-axis
  - True sample-level scatterplot with precise relative seconds from order creation on x-axis (log-scaled) and y-axis binned by specimen state (color-coded by stage)
- Granularity improvements:
  - preprocessing stores second-level stage offsets (`*_s`) plus hour fields
  - timeline uses 15-minute bins from `0-2h`, then 1-hour bins after `2h`
  - ThemeRiver uses the same mixed bins (15-minute then 1-hour)
  - scatterplot x-values use precise second-level offsets from order creation, with adjustable vertical jitter for overplotting
