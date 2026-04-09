(function initDashboardPage() {
  const dashboardDataElement = document.getElementById("dashboard-initial-data");
  const initialData = dashboardDataElement
    ? JSON.parse(dashboardDataElement.textContent)
    : {
        snapshot: null,
        chart: { labels: [], values: [] },
        range: {
          selected_start: null,
          selected_end: null,
          matched_snapshot_count: 0,
          available_start: null,
          available_end: null
        },
        timeline: {
          points: [],
          markers: [],
          count: 0
        }
      };

  const timelineSliderElement = document.getElementById("timelineSlider");
  const timelineMarkersElement = document.getElementById("timelineMarkers");
  const rangeStartInput = document.getElementById("rangeStartInput");
  const rangeEndInput = document.getElementById("rangeEndInput");
  const applyRangeButton = document.getElementById("applyRangeButton");
  const rangeStatus = document.getElementById("rangeStatus");
  const snapshotSummaryElement = document.getElementById("snapshotSummary");
  const noDataMessage = document.getElementById("noDataMessage");
  const groupsContainer = document.getElementById("groupsContainer");
  const metricsContainer = document.getElementById("metricsContainer");
  const chartCanvas = document.getElementById("avgByMetricChart");

  let dashboardState = initialData;
  let chartInstance = null;

  function formatDateTime(value) {
    if (!value) {
      return "n/a";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "n/a";
    }

    return date.toLocaleString();
  }

  function toInputDateTime(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
  }

  function inputDateTimeToIso(value) {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  }

  function formatNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "0.00";
    }
    return numeric.toFixed(2);
  }

  function renderTable(container, columns, rows) {
    if (!rows.length) {
      container.innerHTML = "<p>No rows available for this timeframe.</p>";
      return;
    }

    const headerCells = columns.map((column) => `<th>${column.title}</th>`).join("");
    const bodyRows = rows
      .map((row) => {
        const cells = columns
          .map((column) => `<td>${column.render(row)}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    container.innerHTML = `
      <table>
        <thead>
          <tr>${headerCells}</tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    `;
  }

  function renderSummary(snapshot, range) {
    const items = [
      `<li><strong>Selected start:</strong> ${formatDateTime(range?.selected_start)}</li>`,
      `<li><strong>Selected end:</strong> ${formatDateTime(range?.selected_end)}</li>`,
      `<li><strong>Snapshots aggregated:</strong> ${range?.matched_snapshot_count || 0}</li>`,
      `<li><strong>Available timeline start:</strong> ${formatDateTime(range?.available_start)}</li>`,
      `<li><strong>Available timeline end:</strong> ${formatDateTime(range?.available_end)}</li>`,
      `<li><strong>Total source count:</strong> ${snapshot?.source_count || 0}</li>`
    ];

    snapshotSummaryElement.innerHTML = items.join("");
  }

  function renderChart(chart) {
    if (!chartCanvas) {
      return;
    }

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    if (!chart?.labels?.length) {
      return;
    }

    chartInstance = new Chart(chartCanvas, {
      type: "bar",
      data: {
        labels: chart.labels,
        datasets: [
          {
            label: "Average",
            data: chart.values,
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: false,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  function renderTables(snapshot) {
    const groups = snapshot?.groups || [];
    const metrics = snapshot?.global_by_metric || [];

    renderTable(
      groupsContainer,
      [
        { title: "Metric Type", render: (row) => row.metric_type },
        { title: "Location", render: (row) => row.location },
        { title: "Count", render: (row) => row.count },
        { title: "Min", render: (row) => formatNumber(row.min) },
        { title: "Max", render: (row) => formatNumber(row.max) },
        { title: "Avg", render: (row) => formatNumber(row.avg) },
        { title: "Last Recorded At", render: (row) => formatDateTime(row.last_recorded_at) }
      ],
      groups
    );

    renderTable(
      metricsContainer,
      [
        { title: "Metric Type", render: (row) => row.metric_type },
        { title: "Count", render: (row) => row.count },
        { title: "Min", render: (row) => formatNumber(row.min) },
        { title: "Max", render: (row) => formatNumber(row.max) },
        { title: "Avg", render: (row) => formatNumber(row.avg) },
        { title: "Last Recorded At", render: (row) => formatDateTime(row.last_recorded_at) }
      ],
      metrics
    );
  }

  function findNearestIndex(points, targetIso) {
    if (!points.length || !targetIso) {
      return 0;
    }

    const target = new Date(targetIso).getTime();
    if (Number.isNaN(target)) {
      return 0;
    }

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    points.forEach((point, index) => {
      const value = new Date(point).getTime();
      if (Number.isNaN(value)) {
        return;
      }

      const distance = Math.abs(value - target);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    return nearestIndex;
  }

  function updateMarkerBar(markers) {
    if (!timelineMarkersElement) {
      return;
    }

    if (!markers.length) {
      timelineMarkersElement.innerHTML = "";
      return;
    }

    const denominator = Math.max(markers.length - 1, 1);
    const markerElements = markers
      .map((marker, index) => {
        const hasData = Boolean(marker?.has_data || Number(marker?.group_count) > 0);
        const markerClass = hasData ? "timeline-marker timeline-marker-data" : "timeline-marker timeline-marker-empty";
        return `<span class="${markerClass}" style="left:${(index / denominator) * 100}%"></span>`;
      })
      .join("");

    timelineMarkersElement.innerHTML = markerElements;
  }

  function applySliderValuesToInputs(points, values) {
    if (!points.length) {
      rangeStartInput.value = "";
      rangeEndInput.value = "";
      return;
    }

    const rawStartIndex = Number(values[0]);
    const rawEndIndex = Number(values[1]);
    const startIndex = Math.max(0, Math.min(points.length - 1, Math.round(rawStartIndex)));
    const endIndex = Math.max(0, Math.min(points.length - 1, Math.round(rawEndIndex)));
    const lowerIndex = Math.min(startIndex, endIndex);
    const upperIndex = Math.max(startIndex, endIndex);

    rangeStartInput.value = toInputDateTime(points[lowerIndex]);
    rangeEndInput.value = toInputDateTime(points[upperIndex]);
  }

  function normalizeMarkers(timeline) {
    if (Array.isArray(timeline?.markers) && timeline.markers.length) {
      return timeline.markers;
    }

    const points = Array.isArray(timeline?.points) ? timeline.points : [];
    return points.map((point) => ({
      at: point,
      group_count: 0,
      has_data: false
    }));
  }

  function setupTimelineControls(data) {
    const points = data?.timeline?.points || [];
    const markers = normalizeMarkers(data?.timeline || {});

    updateMarkerBar(markers);

    if (!timelineSliderElement || !window.noUiSlider) {
      return;
    }

    if (timelineSliderElement.noUiSlider) {
      timelineSliderElement.noUiSlider.destroy();
    }

    if (!points.length) {
      timelineSliderElement.innerHTML = "";
      rangeStartInput.value = "";
      rangeEndInput.value = "";
      rangeStartInput.disabled = true;
      rangeEndInput.disabled = true;
      applyRangeButton.disabled = true;
      return;
    }

    rangeStartInput.disabled = false;
    rangeEndInput.disabled = false;
    applyRangeButton.disabled = false;

    const startIndex = findNearestIndex(points, data?.range?.selected_start);
    const endIndex = findNearestIndex(points, data?.range?.selected_end);
    const lower = Math.min(startIndex, endIndex);
    const upper = Math.max(startIndex, endIndex);

    noUiSlider.create(timelineSliderElement, {
      start: [lower, upper],
      connect: true,
      step: 1,
      range: {
        min: 0,
        max: points.length - 1
      },
      tooltips: [
        {
          to: (value) => formatDateTime(points[Math.round(value)]),
          from: () => null
        },
        {
          to: (value) => formatDateTime(points[Math.round(value)]),
          from: () => null
        }
      ]
    });

    timelineSliderElement.noUiSlider.on("update", (values) => {
      applySliderValuesToInputs(points, values);
    });

    applySliderValuesToInputs(points, [lower, upper]);
  }

  function syncUrl(range) {
    const params = new URLSearchParams(window.location.search);

    if (range?.selected_start) {
      params.set("start", range.selected_start);
    } else {
      params.delete("start");
    }

    if (range?.selected_end) {
      params.set("end", range.selected_end);
    } else {
      params.delete("end");
    }

    const serializedParams = params.toString();
    const nextUrl = serializedParams ? `${window.location.pathname}?${serializedParams}` : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);
  }

  function renderAll(data) {
    const snapshot = data?.snapshot;
    const range = data?.range || {};

    renderSummary(snapshot, range);
    renderTables(snapshot);
    renderChart(data?.chart || { labels: [], values: [] });

    const hasData = Boolean(snapshot && (range.matched_snapshot_count || 0) > 0);
    noDataMessage.hidden = hasData;

    rangeStatus.textContent = hasData
      ? `Showing ${range.matched_snapshot_count} snapshot(s) between ${formatDateTime(range.selected_start)} and ${formatDateTime(range.selected_end)}.`
      : "No snapshots in this range. Try widening the timeframe.";

    setupTimelineControls(data);
    syncUrl(range);
  }

  async function refreshDashboardData(startIso, endIso) {
    const params = new URLSearchParams();
    if (startIso) {
      params.set("start", startIso);
    }
    if (endIso) {
      params.set("end", endIso);
    }

    const basePath = window.BASE_PATH || "";
    const response = await fetch(`${basePath}/dashboard/data?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("Unable to fetch dashboard data for the selected timeframe.");
    }

    dashboardState = await response.json();
    renderAll(dashboardState);
  }

  applyRangeButton.addEventListener("click", async () => {
    const startIso = inputDateTimeToIso(rangeStartInput.value);
    const endIso = inputDateTimeToIso(rangeEndInput.value);

    if (!startIso || !endIso) {
      rangeStatus.textContent = "Both start and end time are required.";
      return;
    }

    if (new Date(startIso) > new Date(endIso)) {
      rangeStatus.textContent = "Start time must be earlier than or equal to end time.";
      return;
    }

    rangeStatus.textContent = "Updating dashboard...";

    try {
      await refreshDashboardData(startIso, endIso);
    } catch (error) {
      rangeStatus.textContent = error.message || "Failed to refresh dashboard data.";
    }
  });

  renderAll(dashboardState);
})();
