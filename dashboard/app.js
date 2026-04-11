const DIMENSIONS = [
  "test_code",
  "order_street",
  "test_performing_dept",
  "test_performing_location",
  "day_type",
];

const STAGES = [
  { label: "Collected", field: "collected_h", color: "#d85f41" },
  { label: "Received", field: "received_h", color: "#0f766e" },
  { label: "First Result", field: "first_result_h", color: "#b88618" },
  { label: "Final Verified", field: "final_verified_h", color: "#2f6f45" },
];

const MILESTONE_STAGES = [
  ...STAGES,
  { label: "Cancelled", field: "cancellation_h", color: "#6b7280" },
];

const WINDOW_CONFIGS = [
  { key: "6", hours: 6, title: "6 hours", tone: "coral", color: "#d85f41" },
  { key: "72", hours: 72, title: "72 hours", tone: "teal", color: "#0f766e" },
];

const MIN_LOG_HOURS = 1 / 60;
const LOG_HOUR_GRID = [
  MIN_LOG_HOURS,
  5 / 60,
  15 / 60,
  30 / 60,
  1,
  2,
  4,
  6,
  12,
  24,
  48,
  72,
];

const EMPTY_FILTERS = Object.freeze({
  test_code: "All",
  order_street: "All",
  test_performing_dept: "All",
  test_performing_location: "All",
  day_type: "All",
});

const FILTER_LABELS = {
  test_code: "Test code",
  order_street: "Ordering street",
  test_performing_dept: "Performing department",
  test_performing_location: "Performing location",
  day_type: "Day type",
};

const STEP_DEFINITIONS = [
  { label: "Order → Collected", startField: null, endField: "collected_s", color: "#d85f41" },
  { label: "Collected → Received", startField: "collected_s", endField: "received_s", color: "#0f766e" },
  { label: "Received → First result", startField: "received_s", endField: "first_result_s", color: "#b88618" },
  { label: "First result → Final verified", startField: "first_result_s", endField: "final_verified_s", color: "#2f6f45" },
];

const PLOTLY_CONFIG = {
  responsive: true,
  displaylogo: false,
  displayModeBar: false,
};

const PLOTLY_BASE_LAYOUT = {
  paper_bgcolor: "transparent",
  plot_bgcolor: "transparent",
  margin: { t: 18, r: 20, b: 50, l: 68 },
  font: {
    family: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    size: 12,
    color: "#182127",
  },
  hoverlabel: {
    bgcolor: "#182127",
    bordercolor: "transparent",
    font: { color: "#ffffff" },
  },
  xaxis: {
    gridcolor: "rgba(24, 33, 39, 0.08)",
    zeroline: false,
    linecolor: "rgba(24, 33, 39, 0.16)",
  },
  yaxis: {
    gridcolor: "rgba(24, 33, 39, 0.08)",
    zeroline: false,
    linecolor: "rgba(24, 33, 39, 0.16)",
  },
  legend: {
    orientation: "h",
    x: 0,
    y: 1.12,
  },
};

const state = {
  dataset: null,
  records: [],
  index: {},
  filters: { ...EMPTY_FILTERS },
};

function byId(id) {
  return document.getElementById(id);
}

function setStatus(text, isError = false) {
  const node = byId("status");
  if (!node) return;
  node.textContent = text;
  node.style.color = isError ? "#b42318" : "#56616b";
}

function fmtInt(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function fmtPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function fmtHours(value) {
  if (!Number.isFinite(value)) return "n/a";
  if (value < 1) return `${Math.round(value * 60)} min`;
  return `${value.toFixed(value >= 10 ? 0 : 1)} h`;
}

function fmtPoints(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

function fmtAxisHour(value) {
  if (value < 1) return `${Math.round(value * 60)}m`;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}h`;
}

function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  if (low === high) return sorted[low];
  const weight = idx - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function valueAt(rec, field) {
  const index = state.index[field];
  return Number.isInteger(index) ? rec[index] : null;
}

function hourAt(rec, field) {
  const value = valueAt(rec, field);
  return typeof value === "number" && value >= 0 ? value : NaN;
}

function countWithin(records, field, hours) {
  let count = 0;
  for (const rec of records) {
    const value = hourAt(rec, field);
    if (Number.isFinite(value) && value <= hours) count += 1;
  }
  return count;
}

function shareWithin(records, field, hours) {
  if (!records.length) return 0;
  return countWithin(records, field, hours) / records.length;
}

function getCompletedHours(records, field, upperBound = Infinity) {
  const out = [];
  for (const rec of records) {
    const value = hourAt(rec, field);
    if (Number.isFinite(value) && value <= upperBound) out.push(value);
  }
  return out;
}

function distinctCount(records, field) {
  const seen = new Set();
  for (const rec of records) {
    seen.add(valueAt(rec, field));
  }
  return seen.size;
}

function filterRecords() {
  return state.records.filter((rec) =>
    DIMENSIONS.every((field) => {
      const selected = state.filters[field];
      return selected === "All" || valueAt(rec, field) === selected;
    })
  );
}

function topGroups(records, field, limit) {
  const counts = new Map();
  for (const rec of records) {
    const key = valueAt(rec, field) || "Unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}


function activeFilters() {
  return DIMENSIONS.filter((field) => state.filters[field] !== "All").map((field) => ({
    field,
    label: FILTER_LABELS[field] || field,
    value: state.filters[field],
  }));
}

function renderFilterFeedback(records) {
  const total = state.records.length || 0;
  const ratio = total ? records.length / total : 0;
  const summaryNode = byId("filter-summary");
  const pillsNode = byId("filter-pills");
  if (summaryNode) {
    summaryNode.textContent = `${fmtInt(records.length)} of ${fmtInt(total)} orders shown (${fmtPercent(ratio)} of the full dataset).`;
  }
  if (!pillsNode) return;
  const pills = activeFilters();
  pillsNode.innerHTML = pills.length
    ? pills
        .map(
          (pill) => `<span class="filter-pill"><strong>${pill.label}:</strong> ${pill.value}</span>`
        )
        .join("")
    : `<span class="filter-pill"><strong>All filters:</strong> Entire cohort</span>`;
}

function getStepDurations(records, step) {
  const values = [];
  for (const rec of records) {
    const endValue = valueAt(rec, step.endField);
    if (typeof endValue !== "number" || endValue < 0) continue;
    const hours = step.startField
      ? (endValue - valueAt(rec, step.startField)) / 3600
      : endValue / 3600;
    if (Number.isFinite(hours) && hours >= 0) values.push(hours);
  }
  return values;
}

function computeHandoffStats(records) {
  return STEP_DEFINITIONS.map((step) => {
    const values = getStepDurations(records, step);
    return {
      ...step,
      count: values.length,
      median: percentile(values, 0.5),
      p90: percentile(values, 0.9),
    };
  });
}

function fillInsightGrid(records) {
  const target = byId("insight-grid");
  if (!target) return;
  if (!records.length) {
    target.innerHTML = `
      <article class="insight-card full-span" data-tone="gold">
        <span>No matching orders</span>
        <strong>Broaden the cohort filters</strong>
        <p>Try resetting one or more selectors so the dashboard can recalculate the workflow view.</p>
      </article>
    `;
    return;
  }

  const final6Share = shareWithin(records, "final_verified_h", 6);
  const final72Share = shareWithin(records, "final_verified_h", 72);
  const p90Verified = percentile(getCompletedHours(records, "final_verified_h", 72), 0.9);
  const handoffStats = computeHandoffStats(records).filter((step) => Number.isFinite(step.median));
  const slowestStep = handoffStats.sort((a, b) => b.median - a.median)[0];
  const waterfallCounts = computeWaterfallStateCounts(records);
  const unresolvedEntries = [
    { label: "Cancelled by 72h", count: waterfallCounts.cancelled },
    { label: "Received, no result", count: waterfallCounts.inLab },
    { label: "Result, not verified", count: waterfallCounts.awaitingVerification },
    { label: "Collected, not received", count: waterfallCounts.inTransport },
    { label: "Not collected by 72h", count: waterfallCounts.notCollected },
  ].sort((a, b) => b.count - a.count);
  const biggestUnresolved = unresolvedEntries[0];

  const cards = [
    {
      tone: "coral",
      label: "Lift after the first 6 hours",
      value: fmtPoints((final72Share - final6Share) * 100),
      note: `Verification climbs from ${fmtPercent(final6Share)} at 6 hours to ${fmtPercent(final72Share)} at 72 hours.`,
    },
    {
      tone: "teal",
      label: "90th percentile verified time",
      value: fmtHours(p90Verified),
      note: `Nine in ten completed orders verify by this point inside the 72-hour focus window.`,
    },
    {
      tone: "gold",
      label: "Slowest typical handoff",
      value: slowestStep ? slowestStep.label : "n/a",
      note: slowestStep
        ? `Median ${fmtHours(slowestStep.median)} with a 90th percentile of ${fmtHours(slowestStep.p90)}.`
        : "No valid handoff pairs are available in the current cohort.",
    },
    {
      tone: "forest",
      label: "Largest unresolved bucket",
      value: biggestUnresolved?.count ? biggestUnresolved.label : "All cleared by 72h",
      note: biggestUnresolved?.count
        ? `${fmtInt(biggestUnresolved.count)} orders, or ${fmtPercent(biggestUnresolved.count / records.length)}, still sit here by 72 hours.`
        : "The filtered cohort has no remaining orders outside the 72-hour verified endpoint.",
    },
  ];

  target.innerHTML = cards
    .map(
      (card) => `
        <article class="insight-card" data-tone="${card.tone}">
          <div>
            <span>${card.label}</span>
            <strong>${card.value}</strong>
          </div>
          <p>${card.note}</p>
        </article>
      `
    )
    .join("");
}

function fillSummaryStrip(records) {
  const final6 = countWithin(records, "final_verified_h", 6);
  const final72 = countWithin(records, "final_verified_h", 72);
  const completed72 = getCompletedHours(records, "final_verified_h", 72);
  const outsideWindow = records.length - final72;

  const cards = [
    {
      tone: "teal",
      label: "Orders in focus",
      value: fmtInt(records.length),
      note: `${fmtInt(distinctCount(records, "test_code"))} test codes in the filtered cohort`,
    },
    {
      tone: "coral",
      label: "Verified in 6 hours",
      value: fmtPercent(records.length ? final6 / records.length : 0),
      note: `${fmtInt(final6)} orders finish inside the same-day window`,
    },
    {
      tone: "forest",
      label: "Verified in 72 hours",
      value: fmtPercent(records.length ? final72 / records.length : 0),
      note: `${fmtInt(final72)} orders finish inside the three-day window`,
    },
    {
      tone: "gold",
      label: "Median verified time",
      value: fmtHours(percentile(completed72, 0.5)),
      note: `${fmtInt(outsideWindow)} orders remain outside the 72-hour focus window`,
    },
  ];

  byId("summary-strip").innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card" data-tone="${card.tone}">
          <div>
            <span>${card.label}</span>
            <strong>${card.value}</strong>
          </div>
          <p>${card.note}</p>
        </article>
      `
    )
    .join("");
}

function fillWindowMetrics(records) {
  for (const windowConfig of WINDOW_CONFIGS) {
    const medianVerified = percentile(getCompletedHours(records, "final_verified_h", windowConfig.hours), 0.5);
    const cancellationShare = shareWithin(records, "cancellation_h", windowConfig.hours);
    const cards = [
      {
        tone: windowConfig.tone,
        label: "Final verified",
        value: fmtPercent(shareWithin(records, "final_verified_h", windowConfig.hours)),
        note: "Orders fully completed inside the window",
      },
      {
        tone: "teal",
        label: "Received",
        value: fmtPercent(shareWithin(records, "received_h", windowConfig.hours)),
        note: "Orders delivered to the lab inside the window",
      },
      {
        tone: "gold",
        label: "First result",
        value: fmtPercent(shareWithin(records, "first_result_h", windowConfig.hours)),
        note: "Orders producing a first result inside the window",
      },
      {
        tone: "forest",
        label: "Median verified time",
        value: fmtHours(medianVerified),
        note: `Cancellation share in ${windowConfig.hours}h: ${fmtPercent(cancellationShare)}`,
      },
    ];

    byId(`window-${windowConfig.key}-metrics`).innerHTML = cards
      .map(
        (card) => `
          <article class="metric-chip" data-tone="${card.tone}">
            <div>
              <span>${card.label}</span>
              <strong>${card.value}</strong>
            </div>
            <p>${card.note}</p>
          </article>
        `
      )
      .join("");
  }
}

function renderEmpty(targetId, message) {
  Plotly.react(
    targetId,
    [],
    {
      ...PLOTLY_BASE_LAYOUT,
      margin: { t: 12, r: 12, b: 12, l: 12 },
      xaxis: { visible: false },
      yaxis: { visible: false },
      annotations: [
        {
          x: 0.5,
          y: 0.5,
          xref: "paper",
          yref: "paper",
          showarrow: false,
          text: message,
          font: { size: 14, color: "#56616b" },
        },
      ],
    },
    PLOTLY_CONFIG
  );
}

function renderWindowStageChart(records) {
  if (!records.length) {
    renderEmpty("window-stage-chart", "No matching orders.");
    return;
  }

  const labels = MILESTONE_STAGES.map((stage) => stage.label);
  const traces = WINDOW_CONFIGS.map((windowConfig) => ({
    type: "bar",
    orientation: "h",
    name: `${windowConfig.title}`,
    y: labels,
    x: MILESTONE_STAGES.map((stage) => shareWithin(records, stage.field, windowConfig.hours) * 100),
    marker: { color: windowConfig.color },
    text: MILESTONE_STAGES.map((stage) => fmtPercent(shareWithin(records, stage.field, windowConfig.hours))),
    textposition: "outside",
    cliponaxis: false,
    hovertemplate: "%{y}<br>%{x:.1f}% of orders<extra>" + windowConfig.title + "</extra>",
  }));

  Plotly.react(
    "window-stage-chart",
    traces,
    {
      ...PLOTLY_BASE_LAYOUT,
      barmode: "group",
      margin: { t: 16, r: 28, b: 46, l: 118 },
      xaxis: {
        ...PLOTLY_BASE_LAYOUT.xaxis,
        range: [0, 105],
        ticksuffix: "%",
        title: { text: "Share of filtered orders" },
      },
      yaxis: {
        ...PLOTLY_BASE_LAYOUT.yaxis,
        autorange: "reversed",
      },
    },
    PLOTLY_CONFIG
  );
}

function renderCumulativeChart(records) {
  if (!records.length) {
    renderEmpty("cumulative-chart", "No matching orders.");
    return;
  }

  const horizon = 72;
  const hourLabels = LOG_HOUR_GRID.map(fmtAxisHour);
  const traces = STAGES.map((stage) => {
    const values = getCompletedHours(records, stage.field, horizon)
      .map((value) => Math.max(value, MIN_LOG_HOURS))
      .sort((a, b) => a - b);

    let pointer = 0;
    const y = LOG_HOUR_GRID.map((limit) => {
      while (pointer < values.length && values[pointer] <= limit) pointer += 1;
      return (pointer / records.length) * 100;
    });

    return {
      type: "scatter",
      mode: "lines",
      name: stage.label,
      x: LOG_HOUR_GRID,
      y,
      customdata: hourLabels,
      line: { color: stage.color, width: 3 },
      hovertemplate: "%{customdata}<br>%{y:.1f}% of orders<extra>" + stage.label + "</extra>",
    };
  });

  Plotly.react(
    "cumulative-chart",
    traces,
    {
      ...PLOTLY_BASE_LAYOUT,
      shapes: [
        {
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: MIN_LOG_HOURS,
          x1: 6,
          y0: 0,
          y1: 1,
          fillcolor: "rgba(216, 95, 65, 0.10)",
          line: { width: 0 },
          layer: "below",
        },
        {
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: 6,
          x1: 72,
          y0: 0,
          y1: 1,
          fillcolor: "rgba(15, 118, 110, 0.08)",
          line: { width: 0 },
          layer: "below",
        },
      ],
      annotations: [
        {
          x: 3,
          y: 1.08,
          xref: "x",
          yref: "paper",
          showarrow: false,
          text: "6-hour window",
          font: { color: "#d85f41", size: 12 },
        },
        {
          x: 39,
          y: 1.08,
          xref: "x",
          yref: "paper",
          showarrow: false,
          text: "72-hour window",
          font: { color: "#0f766e", size: 12 },
        },
      ],
      xaxis: {
        ...PLOTLY_BASE_LAYOUT.xaxis,
        type: "log",
        range: [Math.log10(MIN_LOG_HOURS), Math.log10(horizon)],
        tickmode: "array",
        tickvals: LOG_HOUR_GRID,
        ticktext: hourLabels,
        title: { text: "Elapsed hours from order" },
      },
      yaxis: {
        ...PLOTLY_BASE_LAYOUT.yaxis,
        range: [0, 100],
        ticksuffix: "%",
        title: { text: "Cumulative share of filtered orders" },
      },
    },
    PLOTLY_CONFIG
  );
}

function renderDepartmentHeatmap(records, targetId, windowConfig) {
  const groups = topGroups(records, "test_performing_dept", 10);
  if (!groups.length) {
    renderEmpty(targetId, "No matching orders.");
    return;
  }

  const yLabels = groups.map(([name, count]) => `${name} (${fmtInt(count)})`);
  const z = [];
  const text = [];

  for (const [groupName] of groups) {
    const groupRecords = records.filter((rec) => valueAt(rec, "test_performing_dept") === groupName);
    z.push(STAGES.map((stage) => shareWithin(groupRecords, stage.field, windowConfig.hours) * 100));
    text.push(STAGES.map((stage) => fmtPercent(shareWithin(groupRecords, stage.field, windowConfig.hours))));
  }

  Plotly.react(
    targetId,
    [
      {
        type: "heatmap",
        x: STAGES.map((stage) => stage.label),
        y: yLabels,
        z,
        text,
        texttemplate: "%{text}",
        hovertemplate: "%{y}<br>%{x}<br>%{z:.1f}% within " + windowConfig.title + "<extra></extra>",
        colorscale: [
          [0, "#f7faf8"],
          [0.45, "#d9e8dc"],
          [0.75, "#84b89d"],
          [1, "#2f6f45"],
        ],
        zmin: 0,
        zmax: 100,
        showscale: false,
      },
    ],
    {
      ...PLOTLY_BASE_LAYOUT,
      margin: { t: 14, r: 12, b: 52, l: 128 },
      xaxis: {
        ...PLOTLY_BASE_LAYOUT.xaxis,
        tickangle: 0,
      },
      yaxis: {
        ...PLOTLY_BASE_LAYOUT.yaxis,
        automargin: true,
        autorange: "reversed",
      },
    },
    PLOTLY_CONFIG
  );
}

function computeWaterfallStateCounts(records) {
  const counts = {
    verified: 0,
    cancelled: 0,
    awaitingVerification: 0,
    inLab: 0,
    inTransport: 0,
    notCollected: 0,
  };

  for (const rec of records) {
    if (hourAt(rec, "final_verified_h") <= 72) {
      counts.verified += 1;
    } else if (hourAt(rec, "cancellation_h") <= 72) {
      counts.cancelled += 1;
    } else if (hourAt(rec, "first_result_h") <= 72) {
      counts.awaitingVerification += 1;
    } else if (hourAt(rec, "received_h") <= 72) {
      counts.inLab += 1;
    } else if (hourAt(rec, "collected_h") <= 72) {
      counts.inTransport += 1;
    } else {
      counts.notCollected += 1;
    }
  }

  return counts;
}

function renderWaterfallChart(records) {
  if (!records.length) {
    renderEmpty("waterfall-chart", "No matching orders.");
    return;
  }

  const counts = computeWaterfallStateCounts(records);
  const steps = [
    { label: "Ordered", value: records.length, measure: "absolute" },
    { label: "Not collected by 72h", value: -counts.notCollected, measure: "relative" },
    { label: "Collected, not received", value: -counts.inTransport, measure: "relative" },
    { label: "Received, no result", value: -counts.inLab, measure: "relative" },
    { label: "Result, not verified", value: -counts.awaitingVerification, measure: "relative" },
    { label: "Cancelled by 72h", value: -counts.cancelled, measure: "relative" },
    { label: "Verified by 72h", value: 0, measure: "total" },
  ];

  Plotly.react(
    "waterfall-chart",
    [
      {
        type: "waterfall",
        orientation: "h",
        measure: steps.map((step) => step.measure),
        y: steps.map((step) => step.label),
        x: steps.map((step) => step.value),
        text: steps.map((step) => fmtInt(Math.abs(step.measure === "total" ? counts.verified : step.value))),
        textposition: "outside",
        connector: { line: { color: "rgba(24, 33, 39, 0.28)", width: 1 } },
        increasing: { marker: { color: "#0f766e" } },
        decreasing: { marker: { color: "#d85f41" } },
        totals: { marker: { color: "#2f6f45" } },
        hovertemplate: "%{y}<br>%{text} orders<extra></extra>",
      },
    ],
    {
      ...PLOTLY_BASE_LAYOUT,
      margin: { t: 18, r: 32, b: 52, l: 154 },
      xaxis: {
        ...PLOTLY_BASE_LAYOUT.xaxis,
        title: { text: "Orders remaining in the 72-hour path" },
      },
      yaxis: {
        ...PLOTLY_BASE_LAYOUT.yaxis,
        autorange: "reversed",
      },
    },
    PLOTLY_CONFIG
  );
}

function renderTestCodeChart(records) {
  const groups = topGroups(records, "test_code", 12);
  if (!groups.length) {
    renderEmpty("test-code-chart", "No matching orders.");
    return;
  }

  const y = groups.map(([code, count]) => `${code} (${fmtInt(count)})`);
  const categories = [
    {
      name: "0-6h",
      color: "#d85f41",
      getShare(hours) {
        return Number.isFinite(hours) && hours <= 6;
      },
    },
    {
      name: "6-72h",
      color: "#0f766e",
      getShare(hours) {
        return Number.isFinite(hours) && hours > 6 && hours <= 72;
      },
    },
    {
      name: "Outside 72h",
      color: "#9aa4ac",
      getShare(hours) {
        return !Number.isFinite(hours) || hours > 72;
      },
    },
  ];

  const traces = categories.map((category) => {
    const x = [];
    const text = [];
    for (const [code] of groups) {
      const groupRecords = records.filter((rec) => valueAt(rec, "test_code") === code);
      const count = groupRecords.filter((rec) => category.getShare(hourAt(rec, "final_verified_h"))).length;
      const share = groupRecords.length ? (count / groupRecords.length) * 100 : 0;
      x.push(share);
      text.push(`${share.toFixed(1)}%`);
    }

    return {
      type: "bar",
      orientation: "h",
      name: category.name,
      y,
      x,
      marker: { color: category.color },
      text,
      textposition: "inside",
      insidetextanchor: "middle",
      hovertemplate: "%{y}<br>%{x:.1f}%<extra>" + category.name + "</extra>",
    };
  });

  Plotly.react(
    "test-code-chart",
    traces,
    {
      ...PLOTLY_BASE_LAYOUT,
      barmode: "stack",
      legend: {
        ...PLOTLY_BASE_LAYOUT.legend,
        traceorder: "normal",
        x: 0,
        xanchor: "left",
      },
      margin: { t: 14, r: 20, b: 44, l: 106 },
      xaxis: {
        ...PLOTLY_BASE_LAYOUT.xaxis,
        range: [0, 100],
        ticksuffix: "%",
        title: { text: "Share of each test code" },
      },
      yaxis: {
        ...PLOTLY_BASE_LAYOUT.yaxis,
        automargin: true,
        autorange: "reversed",
      },
    },
    PLOTLY_CONFIG
  );
}



function renderHandoffChart(records) {
  const stats = computeHandoffStats(records).filter((step) => Number.isFinite(step.median));
  if (!stats.length) {
    renderEmpty("handoff-chart", "No matching orders.");
    return;
  }

  Plotly.react(
    "handoff-chart",
    [
      {
        type: "bar",
        orientation: "h",
        name: "Median",
        y: stats.map((step) => step.label),
        x: stats.map((step) => step.median),
        marker: { color: stats.map((step) => step.color) },
        text: stats.map((step) => fmtHours(step.median)),
        textposition: "outside",
        cliponaxis: false,
        customdata: stats.map((step) => [step.count, fmtHours(step.p90)]),
        hovertemplate:
          "%{y}<br>Median: %{x:.2f}h<br>90th percentile: %{customdata[1]}<br>Orders with both milestones: %{customdata[0]:,}<extra></extra>",
      },
      {
        type: "scatter",
        mode: "markers",
        name: "90th percentile",
        y: stats.map((step) => step.label),
        x: stats.map((step) => step.p90),
        marker: { color: "#182127", symbol: "diamond", size: 9 },
        hovertemplate: "%{y}<br>90th percentile: %{x:.2f}h<extra></extra>",
      },
    ],
    {
      ...PLOTLY_BASE_LAYOUT,
      margin: { t: 14, r: 30, b: 44, l: 170 },
      legend: {
        ...PLOTLY_BASE_LAYOUT.legend,
        x: 0,
        y: 1.14,
      },
      xaxis: {
        ...PLOTLY_BASE_LAYOUT.xaxis,
        title: { text: "Hours between milestones" },
      },
      yaxis: {
        ...PLOTLY_BASE_LAYOUT.yaxis,
        autorange: "reversed",
      },
    },
    PLOTLY_CONFIG
  );
}

function renderStreetChart(records) {
  const groups = topGroups(records, "order_street", 10);
  if (!groups.length) {
    renderEmpty("street-chart", "No matching orders.");
    return;
  }

  const ordered = groups.map(([street, count]) => {
    const groupRecords = records.filter((rec) => valueAt(rec, "order_street") === street);
    return {
      label: `${street} (${fmtInt(count)})`,
      share72: shareWithin(groupRecords, "final_verified_h", 72) * 100,
      share6: shareWithin(groupRecords, "final_verified_h", 6) * 100,
    };
  });

  Plotly.react(
    "street-chart",
    [
      {
        type: "bar",
        orientation: "h",
        name: "6-hour verified",
        y: ordered.map((item) => item.label),
        x: ordered.map((item) => item.share6),
        marker: { color: "#d85f41" },
        text: ordered.map((item) => `${item.share6.toFixed(1)}%`),
        textposition: "outside",
        cliponaxis: false,
        hovertemplate: "%{y}<br>%{x:.1f}%<extra>6-hour verified</extra>",
      },
      {
        type: "bar",
        orientation: "h",
        name: "72-hour verified",
        y: ordered.map((item) => item.label),
        x: ordered.map((item) => item.share72),
        marker: { color: "#0f766e" },
        text: ordered.map((item) => `${item.share72.toFixed(1)}%`),
        textposition: "outside",
        cliponaxis: false,
        hovertemplate: "%{y}<br>%{x:.1f}%<extra>72-hour verified</extra>",
      },
    ],
    {
      ...PLOTLY_BASE_LAYOUT,
      barmode: "group",
      margin: { t: 14, r: 32, b: 44, l: 122 },
      xaxis: {
        ...PLOTLY_BASE_LAYOUT.xaxis,
        range: [0, 100],
        ticksuffix: "%",
        title: { text: "Share of filtered orders" },
      },
      yaxis: {
        ...PLOTLY_BASE_LAYOUT.yaxis,
        automargin: true,
        autorange: "reversed",
      },
    },
    PLOTLY_CONFIG
  );
}

function updateDatasetNote() {
  if (!byId("dataset-note")) return;
  const generatedAt = state.dataset.generated_at_utc ? new Date(state.dataset.generated_at_utc) : null;
  const windows = state.dataset.focus_windows_hours || WINDOW_CONFIGS.map((config) => config.hours);
  const generatedLabel = generatedAt && !Number.isNaN(generatedAt.valueOf()) ? generatedAt.toLocaleString() : "unknown";
  byId("dataset-note").textContent =
    `Built from ${fmtInt(state.records.length)} order-test records. Window rules: ${windows.join("h and ")}h. Dataset generated ${generatedLabel}.`;
}

function populateFilters() {
  for (const field of DIMENSIONS) {
    const select = byId(`filter-${field}`);
    const values = state.dataset.dimensions?.[field] || [];
    const options = ["All", ...values];
    select.innerHTML = options
      .map((value) => `<option value="${value}">${value}</option>`)
      .join("");
    select.value = state.filters[field];
  }
}

function bindControls() {
  for (const field of DIMENSIONS) {
    byId(`filter-${field}`).addEventListener("change", (event) => {
      state.filters[field] = event.target.value;
      render();
    });
  }

  byId("reset-filters").addEventListener("click", () => {
    state.filters = { ...EMPTY_FILTERS };
    populateFilters();
    render();
  });
}

function render() {
  const records = filterRecords();
  renderFilterFeedback(records);
  fillInsightGrid(records);

  if (!records.length) {
    setStatus("No orders match the current filters.");
    fillSummaryStrip(records);
    fillWindowMetrics(records);
    renderEmpty("window-stage-chart", "No matching orders.");
    renderEmpty("test-code-chart", "No matching orders.");
    renderEmpty("cumulative-chart", "No matching orders.");
    renderEmpty("waterfall-chart", "No matching orders.");
    renderEmpty("heatmap-6-chart", "No matching orders.");
    renderEmpty("heatmap-72-chart", "No matching orders.");
    renderEmpty("handoff-chart", "No matching orders.");
    renderEmpty("street-chart", "No matching orders.");
    return;
  }

  const final72 = countWithin(records, "final_verified_h", 72);
  setStatus(`${fmtInt(records.length)} orders match the filters. ${fmtPercent(final72 / records.length)} are verified within 72 hours.`);

  fillSummaryStrip(records);
  fillWindowMetrics(records);
  renderWindowStageChart(records);
  renderTestCodeChart(records);
  renderCumulativeChart(records);
  renderWaterfallChart(records);
  renderDepartmentHeatmap(records, "heatmap-6-chart", WINDOW_CONFIGS[0]);
  renderDepartmentHeatmap(records, "heatmap-72-chart", WINDOW_CONFIGS[1]);
  renderHandoffChart(records);
  renderStreetChart(records);
}

async function init() {
  try {
    const response = await fetch("./data/orders_compact.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    state.dataset = await response.json();
    state.records = state.dataset.records || [];
    state.index = Object.fromEntries((state.dataset.fields || []).map((field, index) => [field, index]));

    updateDatasetNote();
    populateFilters();
    bindControls();
    render();
  } catch (error) {
    setStatus("Failed to load dashboard data.", true);
    byId("dataset-note").textContent = "The dashboard data could not be loaded.";
    console.error(error);
    renderEmpty("window-stage-chart", "Dashboard data failed to load.");
    renderEmpty("test-code-chart", "Dashboard data failed to load.");
    renderEmpty("cumulative-chart", "Dashboard data failed to load.");
    renderEmpty("waterfall-chart", "Dashboard data failed to load.");
    renderEmpty("heatmap-6-chart", "Dashboard data failed to load.");
    renderEmpty("heatmap-72-chart", "Dashboard data failed to load.");
    renderEmpty("handoff-chart", "Dashboard data failed to load.");
    renderEmpty("street-chart", "Dashboard data failed to load.");
  }
}

window.addEventListener("DOMContentLoaded", init);

