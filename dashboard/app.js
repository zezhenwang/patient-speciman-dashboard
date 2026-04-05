const DIMENSIONS = [
  "test_code",
  "order_street",
  "test_performing_dept",
  "test_performing_location",
  "day_type",
];

const STAGE_DEFS = [
  { label: "Ordered", field: null, color: "#9AA0A6", rank: 0 },
  { label: "Collected", field: "collected_h", color: "#F58518", rank: 1 },
  { label: "Received", field: "received_h", color: "#54A24B", rank: 2 },
  { label: "First Result", field: "first_result_h", color: "#E45756", rank: 3 },
  { label: "Final Verified", field: "final_verified_h", color: "#1565C0", rank: 4 },
  { label: "Cancelled", field: "cancellation_h", color: "#8B949E", rank: 5 },
];

const TIMELINE_SERIES = [
  { label: "Ordered", field: null, color: "#9AA0A6", dash: "dash", width: 2 },
  { label: "Collected", field: "collected_h", color: "#F58518", width: 3 },
  { label: "Received", field: "received_h", color: "#54A24B", width: 3 },
  { label: "First Result", field: "first_result_h", color: "#E45756", width: 3 },
  { label: "Final Verified", field: "final_verified_h", color: "#1565C0", width: 3 },
  { label: "Likeliness of cancellation", field: "cancellation_h", color: "#8B949E", width: 3, dash: "dot", isCancellation: true },
];

const PRECISE_SECOND_FIELDS = {
  collected_h: "collected_s",
  received_h: "received_s",
  first_result_h: "first_result_s",
  final_verified_h: "final_verified_s",
  cancellation_h: "cancellation_s",
};

const DEFAULT_FILTER = Object.freeze({
  test_code: "All",
  order_street: "All",
  test_performing_dept: "All",
  test_performing_location: "All",
  day_type: "All",
});

const state = {
  dataset: null,
  records: [],
  index: {},
  showComparison: false,
  showCancellation: true,
  scatterJitter: 0,
  panels: {
    left: { ...DEFAULT_FILTER },
    right: { ...DEFAULT_FILTER },
  },
};

function byId(id) {
  return document.getElementById(id);
}

function status(text, isError = false) {
  const node = byId("status");
  node.textContent = text;
  node.style.color = isError ? "#b42318" : "#6b7280";
}

function fmtPercent(v) {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtInt(v) {
  return new Intl.NumberFormat("en-US").format(v);
}

function percentile(values, p) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  const weight = index - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function validHour(v) {
  return Number.isFinite(v) && v >= 0;
}

function hasIndex(field) {
  return Number.isInteger(state.index[field]) && state.index[field] >= 0;
}

function getHourValue(rec, hourField) {
  if (!hourField) return 0;

  const secondField = PRECISE_SECOND_FIELDS[hourField];
  if (secondField && hasIndex(secondField)) {
    const secs = rec[state.index[secondField]];
    if (Number.isFinite(secs) && secs >= 0) return secs / 3600;
  }

  if (!hasIndex(hourField)) return NaN;
  const hours = rec[state.index[hourField]];
  return Number.isFinite(hours) && hours >= 0 ? hours : NaN;
}

function getRelativeSeconds(rec, hourField) {
  if (!hourField) return 0;
  const secondField = PRECISE_SECOND_FIELDS[hourField];
  if (!secondField || !hasIndex(secondField)) return NaN;
  const secs = rec[state.index[secondField]];
  return Number.isFinite(secs) && secs >= 0 ? secs : NaN;
}

function formatDurationLabel(seconds) {
  const s = Math.max(0, seconds);
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) {
    const h = s / 3600;
    return `${Number(h.toFixed(h >= 10 ? 0 : 1))}h`;
  }
  const d = s / 86400;
  return `${Number(d.toFixed(d >= 10 ? 0 : 1))}d`;
}

function buildHourAxis(maxHours) {
  const upper = Math.max(24, Math.ceil(maxHours));
  let stepHours = 1;
  if (upper > 72) stepHours = 2;
  if (upper > 168) stepHours = 6;
  if (upper > 24 * 14) stepHours = 24;
  const tickvals = [];
  for (let h = 0; h <= upper; h += stepHours) tickvals.push(h);
  const ticktext = tickvals.map((h) => `${h}h`);
  return {
    type: "linear",
    range: [0, upper + 0.001],
    tickmode: "array",
    tickvals,
    ticktext,
  };
}

function seededUnit(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function renderEmptyChart(target, title, message) {
  Plotly.react(
    target,
    [],
    {
      title: { text: title, x: 0.01 },
      margin: { t: 44, r: 24, b: 42, l: 56 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      annotations: [
        {
          text: message,
          xref: "paper",
          yref: "paper",
          x: 0.5,
          y: 0.5,
          showarrow: false,
          font: { size: 14, color: "#6b7280" },
        },
      ],
      xaxis: { visible: false },
      yaxis: { visible: false },
    },
    { responsive: true, displaylogo: false }
  );
}

function computeMaxHours(records) {
  const keys = ["collected_h", "received_h", "first_result_h", "final_verified_h", "cancellation_h"];
  const values = [];
  for (const rec of records) {
    for (const key of keys) {
      const hours = getHourValue(rec, key);
      if (validHour(hours)) values.push(hours);
    }
  }
  if (!values.length) return 24;
  const upper = percentile(values, 0.995) + 4;
  return Math.max(24, Math.ceil(upper));
}

function toAxisHour(hours) {
  return Math.max(0, hours);
}

function getRelativeHoursOrFallback(rec, hourField) {
  const secs = getRelativeSeconds(rec, hourField);
  if (Number.isFinite(secs) && secs >= 0) return secs / 3600;
  return getHourValue(rec, hourField);
}

function buildHourGrid(maxHours) {
  const upper = Math.max(24, Math.ceil(maxHours));
  const out = [];
  for (let h = 0; h <= upper; h += 1) out.push(h);
  return out;
}

function buildEmpiricalCdfSeries(records, hourField, cohortSize, maxHours) {
  const hours = buildHourGrid(maxHours);
  const counts = new Int32Array(hours.length);

  for (const rec of records) {
    const value = getRelativeHoursOrFallback(rec, hourField);
    if (!validHour(value)) continue;
    const idx = Math.max(0, Math.min(hours.length - 1, Math.floor(value)));
    counts[idx] += 1;
  }

  const y = new Array(hours.length);
  let running = 0;
  for (let i = 0; i < hours.length; i += 1) {
    running += counts[i];
    y[i] = running / cohortSize;
  }

  return { x: hours.map(toAxisHour), y };
}

function filterRecords(filters) {
  const iTest = state.index.test_code;
  const iStreet = state.index.order_street;
  const iDept = state.index.test_performing_dept;
  const iLoc = state.index.test_performing_location;
  const iDay = state.index.day_type;

  const out = [];
  for (const rec of state.records) {
    if (filters.test_code !== "All" && rec[iTest] !== filters.test_code) continue;
    if (filters.order_street !== "All" && rec[iStreet] !== filters.order_street) continue;
    if (filters.test_performing_dept !== "All" && rec[iDept] !== filters.test_performing_dept) continue;
    if (filters.test_performing_location !== "All" && rec[iLoc] !== filters.test_performing_location) continue;
    if (filters.day_type !== "All" && rec[iDay] !== filters.day_type) continue;
    out.push(rec);
  }
  return out;
}

function updateStats(panel, n, cancellationRate) {
  byId(`${panel}-stats`).textContent = n
    ? `N = ${fmtInt(n)} | cancellation = ${fmtPercent(cancellationRate)}`
    : "No records for current filters";
}

function renderTimeline(panel, records, maxHours) {
  const target = byId(`${panel}-timeline`);
  const n = records.length;

  if (!n) {
    renderEmptyChart(target, "Average Workflow Timeline", "No records for current filters");
    return { cancellationRate: 0, maxHours: 24 };
  }

  const traces = [];

  for (const series of TIMELINE_SERIES) {
    if (series.isCancellation && !state.showCancellation) continue;

    if (series.label === "Ordered") {
      traces.push({
        x: [toAxisHour(0), toAxisHour(maxHours)],
        y: [1, 1],
        mode: "lines",
        name: series.label,
        line: { color: series.color, width: series.width, dash: series.dash },
        hovertemplate: `${series.label}<br>%{x:.2f}h: %{y:.1%}<extra></extra>`,
      });
      continue;
    }

    const curve = buildEmpiricalCdfSeries(records, series.field, n, maxHours);
    traces.push({
      x: curve.x,
      y: curve.y,
      mode: "lines",
      name: series.label,
      line: { shape: "hv", color: series.color, width: series.width, dash: series.dash || "solid" },
      hovertemplate: `${series.label}<br>%{x:.2f}h: %{y:.1%}<extra></extra>`,
    });
  }

  const cancellationRate = records
    .map((r) => getRelativeHoursOrFallback(r, "cancellation_h"))
    .filter(validHour).length / n;

  Plotly.react(
    target,
    traces,
    {
      title: { text: "Average Workflow Timeline", x: 0.01 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      margin: { t: 52, r: 20, b: 56, l: 56 },
      xaxis: {
        title: "Hours since order creation",
        ...buildHourAxis(maxHours),
        gridcolor: "#edf2f7",
        zeroline: false,
      },
      yaxis: {
        title: "Share of cohort",
        tickformat: ".0%",
        range: [0, 1.03],
        gridcolor: "#edf2f7",
        zeroline: false,
      },
      legend: { orientation: "h", y: -0.24, x: 0 },
    },
    { responsive: true, displaylogo: false }
  );

  return { cancellationRate, maxHours };
}

function getRecordHours(rec) {
  return {
    ordered: 0,
    collected: getHourValue(rec, "collected_h"),
    received: getHourValue(rec, "received_h"),
    firstResult: getHourValue(rec, "first_result_h"),
    finalVerified: getHourValue(rec, "final_verified_h"),
    cancellation: getHourValue(rec, "cancellation_h"),
  };
}

function buildFlowData(records) {
  const baseNodes = ["Ordered", "Collected", "Received", "First Result", "Final Verified"];
  const nodeColors = {
    Ordered: "#9AA0A6",
    Collected: "#F58518",
    Received: "#54A24B",
    "First Result": "#E45756",
    "Final Verified": "#1565C0",
    Cancelled: "#8B949E",
  };

  const rank = {
    Ordered: 0,
    Collected: 1,
    Received: 2,
    "First Result": 3,
    "Final Verified": 4,
  };

  const edgeCounts = new Map();
  const addEdge = (source, target, value = 1) => {
    const key = `${source}>>${target}`;
    edgeCounts.set(key, (edgeCounts.get(key) || 0) + value);
  };

  for (const rec of records) {
    const h = getRecordHours(rec);
    const path = [{ label: "Ordered", hour: 0 }];

    if (validHour(h.collected)) path.push({ label: "Collected", hour: h.collected });
    if (validHour(h.received)) path.push({ label: "Received", hour: h.received });
    if (validHour(h.firstResult)) path.push({ label: "First Result", hour: h.firstResult });
    if (validHour(h.finalVerified)) path.push({ label: "Final Verified", hour: h.finalVerified });

    path.sort((a, b) => {
      if (a.hour !== b.hour) return a.hour - b.hour;
      return rank[a.label] - rank[b.label];
    });

    const cleanPath = [path[0]];
    for (let i = 1; i < path.length; i += 1) {
      if (path[i].label !== cleanPath[cleanPath.length - 1].label) {
        cleanPath.push(path[i]);
      }
    }

    for (let i = 0; i < cleanPath.length - 1; i += 1) {
      addEdge(cleanPath[i].label, cleanPath[i + 1].label);
    }

    if (state.showCancellation && validHour(h.cancellation)) {
      let source = "Ordered";
      for (const point of cleanPath) {
        if (point.hour <= h.cancellation + 1e-9) source = point.label;
      }
      addEdge(source, "Cancelled");
    }
  }

  let nodeLabels = [...baseNodes];
  const hasCancel = state.showCancellation && [...edgeCounts.keys()].some((k) => k.endsWith(">>Cancelled"));
  if (hasCancel) nodeLabels.push("Cancelled");

  const nodeIndex = Object.fromEntries(nodeLabels.map((label, idx) => [label, idx]));

  const source = [];
  const target = [];
  const value = [];
  const linkColor = [];

  for (const [key, count] of edgeCounts.entries()) {
    const [s, t] = key.split(">>");
    if (!(s in nodeIndex) || !(t in nodeIndex)) continue;
    if (count <= 0) continue;
    source.push(nodeIndex[s]);
    target.push(nodeIndex[t]);
    value.push(count);
    linkColor.push(t === "Cancelled" ? "rgba(139,148,158,0.45)" : "rgba(31,41,55,0.18)");
  }

  if (!value.length) return null;

  return {
    nodeLabels,
    nodeColors: nodeLabels.map((label) => nodeColors[label]),
    source,
    target,
    value,
    linkColor,
  };
}

function renderFlowchart(panel, records) {
  const target = byId(`${panel}-flow`);

  if (!records.length) {
    renderEmptyChart(target, "Flowchart of Samples Between Stages", "No records for current filters");
    return;
  }

  const flow = buildFlowData(records);
  if (!flow) {
    renderEmptyChart(target, "Flowchart of Samples Between Stages", "No stage transitions available");
    return;
  }

  Plotly.react(
    target,
    [
      {
        type: "sankey",
        arrangement: "snap",
        node: {
          label: flow.nodeLabels,
          color: flow.nodeColors,
          pad: 18,
          thickness: 16,
          line: { color: "rgba(0,0,0,0.2)", width: 0.5 },
        },
        link: {
          source: flow.source,
          target: flow.target,
          value: flow.value,
          color: flow.linkColor,
        },
      },
    ],
    {
      title: { text: "Flowchart of Samples Between Stages", x: 0.01 },
      margin: { t: 44, r: 24, b: 20, l: 16 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      font: { size: 12 },
    },
    { responsive: true, displaylogo: false }
  );
}

function buildStageCounts(records, maxHours) {
  const stageLabels = state.showCancellation
    ? ["Ordered", "Collected", "Received", "First Result", "Final Verified", "Cancelled"]
    : ["Ordered", "Collected", "Received", "First Result", "Final Verified"];

  const hours = buildHourGrid(maxHours);
  const binCount = hours.length;
  const series = Object.fromEntries(stageLabels.map((label) => [label, new Int32Array(binCount)]));

  const addEvent = (label, value) => {
    if (!validHour(value)) return;
    const idx = Math.max(0, Math.min(binCount - 1, Math.floor(value)));
    series[label][idx] += 1;
  };

  for (const rec of records) {
    addEvent("Ordered", 0);
    addEvent("Collected", getRelativeHoursOrFallback(rec, "collected_h"));
    addEvent("Received", getRelativeHoursOrFallback(rec, "received_h"));
    addEvent("First Result", getRelativeHoursOrFallback(rec, "first_result_h"));
    addEvent("Final Verified", getRelativeHoursOrFallback(rec, "final_verified_h"));
    if (state.showCancellation) addEvent("Cancelled", getRelativeHoursOrFallback(rec, "cancellation_h"));
  }

  const outSeries = {};
  for (const label of stageLabels) outSeries[label] = Array.from(series[label]);

  return { x: hours, series: outSeries, stageLabels };
}

function renderThemeRiver(panel, records, maxHours) {
  const target = byId(`${panel}-river`);

  if (!records.length) {
    renderEmptyChart(target, "ThemeRiver by Stage", "No records for current filters");
    return;
  }

  const counts = buildStageCounts(records, maxHours);
  const xHours = counts.x.map(toAxisHour);
  const totals = counts.x.map((_, idx) => {
    let sum = 0;
    for (const label of counts.stageLabels) sum += counts.series[label][idx];
    return sum;
  });

  const traces = counts.stageLabels.map((label) => {
    const def = STAGE_DEFS.find((s) => s.label === label);
    const rawY = counts.series[label];
    const propY = rawY.map((v, idx) => (totals[idx] > 0 ? v / totals[idx] : 0));
    const hoverData = rawY.map((v, idx) => [v, totals[idx]]);
    return {
      type: "scatter",
      mode: "lines",
      stackgroup: "one",
      name: label,
      x: xHours,
      y: propY,
      customdata: hoverData,
      line: { width: 0.7, color: def.color },
      fillcolor: def.color,
      hovertemplate: `${label}<br>%{x:.2f}h<br>%{customdata[0]:,} / %{customdata[1]:,} events<br>%{y:.1%}<extra></extra>`,
    };
  });

  Plotly.react(
    target,
    traces,
    {
      title: { text: "ThemeRiver by Stage (Proportion of Events per Hour)", x: 0.01 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      margin: { t: 44, r: 22, b: 50, l: 60 },
      xaxis: {
        title: "Hours since order creation",
        ...buildHourAxis(maxHours),
        gridcolor: "#edf2f7",
        zeroline: false,
      },
      yaxis: { title: "Share of events", tickformat: ".0%", range: [0, 1], gridcolor: "#edf2f7", zeroline: false },
      legend: { orientation: "h", y: -0.28, x: 0 },
    },
    { responsive: true, displaylogo: false }
  );
}

function buildScatterTraces(records, maxHoursAxis) {
  const stages = state.showCancellation ? STAGE_DEFS : STAGE_DEFS.filter((s) => s.label !== "Cancelled");
  const jitterScale = state.scatterJitter;
  const maxX = toAxisHour(maxHoursAxis);

  const pointsByStage = Object.fromEntries(stages.map((s) => [s.label, { x: [], y: [], text: [], customdata: [] }]));

  for (let recIdx = 0; recIdx < records.length; recIdx += 1) {
    const rec = records[recIdx];

    for (let stageIdx = 0; stageIdx < stages.length; stageIdx += 1) {
      const stage = stages[stageIdx];
      const eventHours = getRelativeHoursOrFallback(rec, stage.field);
      if (!validHour(eventHours)) continue;

      const seed = (recIdx + 1) * 131 + (stageIdx + 1) * 977;
      const baseX = toAxisHour(Math.floor(eventHours));
      const xJitter = (seededUnit(seed + 1) - 0.5) * 0.8 * jitterScale;
      const jitteredX = Math.max(0, Math.min(maxX, baseX + xJitter));
      const yJitter = (seededUnit(seed + 2) - 0.5) * 0.6 * jitterScale;
      const yValue = stage.rank + yJitter;

      pointsByStage[stage.label].x.push(jitteredX);
      pointsByStage[stage.label].y.push(yValue);
      pointsByStage[stage.label].text.push(`${stage.label} | sample #${(recIdx + 1).toLocaleString()}`);
      pointsByStage[stage.label].customdata.push([eventHours, formatDurationLabel(eventHours * 3600)]);
    }
  }

  const traces = stages
    .map((stage) => {
      const pts = pointsByStage[stage.label];
      if (!pts.x.length) return null;
      return {
        type: "scattergl",
        mode: "markers",
        name: stage.label,
        x: pts.x,
        y: pts.y,
        text: pts.text,
        customdata: pts.customdata,
        marker: {
          size: 5,
          color: stage.color,
          opacity: 0.45,
          line: { width: 0 },
        },
        hovertemplate: `%{text}<br>%{customdata[0]:.2f}h (%{customdata[1]})<extra></extra>`,
      };
    })
    .filter(Boolean);

  return {
    traces,
    tickvals: stages.map((s) => s.rank),
    ticktext: stages.map((s) => s.label),
  };
}

function renderStateScatter(panel, records, maxHoursAxis) {
  const target = byId(`${panel}-scatter`);

  if (!records.length) {
    renderEmptyChart(target, "State Scatterplot", "No records for current filters");
    return;
  }

  const scatter = buildScatterTraces(records, maxHoursAxis);
  if (!scatter.traces.length) {
    renderEmptyChart(target, "State Scatterplot", "No point events available");
    return;
  }

  Plotly.react(
    target,
    scatter.traces,
    {
      title: { text: "Sample-Level Event Scatterplot", x: 0.01 },
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      margin: { t: 44, r: 20, b: 62, l: 88 },
      xaxis: {
        title: "Hours since order creation",
        ...buildHourAxis(maxHoursAxis),
        gridcolor: "#edf2f7",
        zeroline: false,
      },
      yaxis: {
        title: "State of specimen",
        tickmode: "array",
        tickvals: scatter.tickvals,
        ticktext: scatter.ticktext,
        range: [
          Math.min(...scatter.tickvals) - 0.7,
          Math.max(...scatter.tickvals) + 0.7,
        ],
        gridcolor: "#edf2f7",
        zeroline: false,
      },
      legend: { orientation: "h", y: -0.26, x: 0 },
    },
    { responsive: true, displaylogo: false }
  );
}

function renderPanel(panel) {
  const filtered = filterRecords(state.panels[panel]);
  const n = filtered.length;
  const maxHours = computeMaxHours(filtered);

  const { cancellationRate } = renderTimeline(panel, filtered, maxHours);
  renderFlowchart(panel, filtered);
  renderThemeRiver(panel, filtered, maxHours);
  renderStateScatter(panel, filtered, maxHours);

  updateStats(panel, n, cancellationRate);
}

function renderAll() {
  renderPanel("left");
  if (state.showComparison) renderPanel("right");
}

function populateSelect(panel, field, options) {
  const select = byId(`${panel}-filter-${field}`);
  const all = ["All", ...options];

  select.innerHTML = "";
  for (const value of all) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }

  select.value = state.panels[panel][field] || "All";
}

function populateControls() {
  for (const panel of ["left", "right"]) {
    for (const field of DIMENSIONS) {
      populateSelect(panel, field, state.dataset.dimensions[field] || []);
    }
  }
}

function readFiltersFromUI(panel) {
  const next = {};
  for (const field of DIMENSIONS) {
    next[field] = byId(`${panel}-filter-${field}`).value;
  }
  state.panels[panel] = next;
}

function setComparisonEnabled(enabled) {
  state.showComparison = enabled;
  byId("panel-right").hidden = !enabled;
  byId("panel-grid").classList.toggle("compare", enabled);
  byId("comparison-btn").textContent = enabled ? "Close Comparison" : "Comparison";
}

function wireEvents() {
  document.querySelectorAll("select[data-panel][data-field]").forEach((select) => {
    select.addEventListener("change", () => {
      const panel = select.dataset.panel;
      readFiltersFromUI(panel);
      renderPanel(panel);
    });
  });

  byId("comparison-btn").addEventListener("click", () => {
    if (!state.showComparison) {
      state.panels.right = { ...state.panels.left };
      for (const field of DIMENSIONS) {
        byId(`right-filter-${field}`).value = state.panels.right[field];
      }
      setComparisonEnabled(true);
      renderPanel("right");
      return;
    }

    setComparisonEnabled(false);
  });

  byId("toggle-cancellation").addEventListener("change", (event) => {
    state.showCancellation = event.target.checked;
    renderAll();
  });

  const jitterSlider = byId("jitter-slider");
  const jitterValue = byId("jitter-value");
  const syncJitterLabel = () => {
    jitterValue.textContent = `${state.scatterJitter.toFixed(2)}x`;
  };

  jitterSlider.addEventListener("input", (event) => {
    state.scatterJitter = Number(event.target.value);
    syncJitterLabel();
    renderAll();
  });
  syncJitterLabel();
}

async function loadDataset() {
  const response = await fetch("./data/orders_compact.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load data (${response.status})`);
  }
  return response.json();
}

async function init() {
  try {
    const dataset = await loadDataset();
    state.dataset = dataset;
    state.records = dataset.records || [];

    const fields = dataset.fields || [];
    const requiredFields = [
      "test_code",
      "order_street",
      "test_performing_dept",
      "test_performing_location",
      "day_type",
      "collected_h",
      "received_h",
      "first_result_h",
      "final_verified_h",
      "cancellation_h",
    ];

    for (const field of fields) {
      state.index[field] = fields.indexOf(field);
    }

    const missing = requiredFields.filter((f) => !(f in state.index));
    if (missing.length) {
      throw new Error(`Dataset missing required fields: ${missing.join(", ")}`);
    }

    populateControls();
    wireEvents();
    setComparisonEnabled(false);

    status(
      `Loaded ${fmtInt(state.records.length)} order-test records from ${dataset.source_zip}. Use filters and optional Comparison mode.`
    );

    await new Promise((resolve) => requestAnimationFrame(resolve));
    renderAll();
  } catch (error) {
    console.error(error);
    status(`Failed to initialize dashboard: ${error.message}`, true);
  }
}

init();
