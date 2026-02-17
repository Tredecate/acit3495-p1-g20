const { getTimelineSnapshots, getSnapshotsInRange } = require("../db/mongo");

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoOrNull(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateOrNull(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function maxIso(left, right) {
  const leftDate = toDateOrNull(left);
  const rightDate = toDateOrNull(right);

  if (!leftDate && !rightDate) {
    return null;
  }

  if (!leftDate) {
    return rightDate.toISOString();
  }

  if (!rightDate) {
    return leftDate.toISOString();
  }

  return leftDate >= rightDate ? leftDate.toISOString() : rightDate.toISOString();
}

function normalizeGroup(group = {}) {
  return {
    metric_type: group.metric_type || "unknown",
    location: group.location || "unknown",
    count: toNumber(group.count),
    min: toNumber(group.min),
    max: toNumber(group.max),
    avg: toNumber(group.avg),
    last_recorded_at: toIsoOrNull(group.last_recorded_at)
  };
}

function normalizeMetric(metric = {}) {
  return {
    metric_type: metric.metric_type || "unknown",
    count: toNumber(metric.count),
    min: toNumber(metric.min),
    max: toNumber(metric.max),
    avg: toNumber(metric.avg),
    last_recorded_at: toIsoOrNull(metric.last_recorded_at)
  };
}

function normalizeSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }

  const groups = Array.isArray(snapshot.groups) ? snapshot.groups.map(normalizeGroup) : [];
  const globalByMetric = Array.isArray(snapshot.global_by_metric)
    ? snapshot.global_by_metric.map(normalizeMetric)
    : [];

  return {
    calculated_at: toIsoOrNull(snapshot.calculated_at),
    window_start: toIsoOrNull(snapshot.window_start),
    window_end: toIsoOrNull(snapshot.window_end),
    source_count: toNumber(snapshot.source_count),
    matched_snapshot_count: toNumber(snapshot.matched_snapshot_count),
    groups,
    global_by_metric: globalByMetric
  };
}

function buildChartData(snapshot) {
  if (!snapshot) {
    return { labels: [], values: [] };
  }

  return {
    labels: snapshot.global_by_metric.map((item) => item.metric_type),
    values: snapshot.global_by_metric.map((item) => item.avg)
  };
}

function aggregateByMetric(snapshots) {
  const byMetric = new Map();

  snapshots.forEach((snapshot) => {
    const metrics = Array.isArray(snapshot.global_by_metric) ? snapshot.global_by_metric : [];

    metrics.forEach((metric) => {
      const key = metric.metric_type || "unknown";
      const count = toNumber(metric.count);
      const avg = toNumber(metric.avg);
      const min = toNumber(metric.min);
      const max = toNumber(metric.max);

      if (!byMetric.has(key)) {
        byMetric.set(key, {
          metric_type: key,
          count: 0,
          min,
          max,
          weighted_sum: 0,
          last_recorded_at: null
        });
      }

      const aggregated = byMetric.get(key);
      aggregated.count += count;
      aggregated.weighted_sum += avg * count;
      aggregated.min = Math.min(aggregated.min, min);
      aggregated.max = Math.max(aggregated.max, max);
      aggregated.last_recorded_at = maxIso(aggregated.last_recorded_at, metric.last_recorded_at);
    });
  });

  return [...byMetric.values()]
    .map((metric) => ({
      metric_type: metric.metric_type,
      count: metric.count,
      min: metric.min,
      max: metric.max,
      avg: metric.count ? metric.weighted_sum / metric.count : 0,
      last_recorded_at: metric.last_recorded_at
    }))
    .sort((left, right) => left.metric_type.localeCompare(right.metric_type));
}

function aggregateByGroup(snapshots) {
  const byGroup = new Map();

  snapshots.forEach((snapshot) => {
    const groups = Array.isArray(snapshot.groups) ? snapshot.groups : [];

    groups.forEach((group) => {
      const metricType = group.metric_type || "unknown";
      const location = group.location || "unknown";
      const key = `${metricType}::${location}`;
      const count = toNumber(group.count);
      const avg = toNumber(group.avg);
      const min = toNumber(group.min);
      const max = toNumber(group.max);

      if (!byGroup.has(key)) {
        byGroup.set(key, {
          metric_type: metricType,
          location,
          count: 0,
          min,
          max,
          weighted_sum: 0,
          last_recorded_at: null
        });
      }

      const aggregated = byGroup.get(key);
      aggregated.count += count;
      aggregated.weighted_sum += avg * count;
      aggregated.min = Math.min(aggregated.min, min);
      aggregated.max = Math.max(aggregated.max, max);
      aggregated.last_recorded_at = maxIso(aggregated.last_recorded_at, group.last_recorded_at);
    });
  });

  return [...byGroup.values()]
    .map((group) => ({
      metric_type: group.metric_type,
      location: group.location,
      count: group.count,
      min: group.min,
      max: group.max,
      avg: group.count ? group.weighted_sum / group.count : 0,
      last_recorded_at: group.last_recorded_at
    }))
    .sort((left, right) => {
      const metricSort = left.metric_type.localeCompare(right.metric_type);
      if (metricSort !== 0) {
        return metricSort;
      }

      return left.location.localeCompare(right.location);
    });
}

function aggregateSnapshots(snapshots, selectedStartIso, selectedEndIso) {
  if (!snapshots.length) {
    return null;
  }

  let calculatedAt = null;
  let windowStart = null;
  let windowEnd = null;
  let sourceCount = 0;

  snapshots.forEach((snapshot) => {
    calculatedAt = maxIso(calculatedAt, snapshot.calculated_at);

    const snapshotStart = toDateOrNull(snapshot.window_start);
    if (snapshotStart && (!windowStart || snapshotStart < windowStart)) {
      windowStart = snapshotStart;
    }

    const snapshotEnd = toDateOrNull(snapshot.window_end);
    if (snapshotEnd && (!windowEnd || snapshotEnd > windowEnd)) {
      windowEnd = snapshotEnd;
    }

    sourceCount += toNumber(snapshot.source_count);
  });

  return normalizeSnapshot({
    calculated_at: calculatedAt,
    window_start: selectedStartIso || toIsoOrNull(windowStart),
    window_end: selectedEndIso || toIsoOrNull(windowEnd),
    source_count: sourceCount,
    matched_snapshot_count: snapshots.length,
    groups: aggregateByGroup(snapshots),
    global_by_metric: aggregateByMetric(snapshots)
  });
}

function normalizeTimeline(snapshotSummaries = []) {
  const byTimestamp = new Map();

  snapshotSummaries.forEach((summary) => {
    const at = toIsoOrNull(summary.calculated_at);
    if (!at) {
      return;
    }

    const groupCount = toNumber(summary.group_count);
    const existing = byTimestamp.get(at);

    if (!existing || groupCount > existing.group_count) {
      byTimestamp.set(at, {
        at,
        group_count: groupCount,
        has_data: groupCount > 0
      });
    }
  });

  const markers = [...byTimestamp.values()].sort((left, right) => left.at.localeCompare(right.at));

  return {
    points: markers.map((marker) => marker.at),
    markers
  };
}

function resolveRange(timelinePoints, requestedStart, requestedEnd) {
  if (!timelinePoints.length) {
    return {
      available_start: null,
      available_end: null,
      selected_start: null,
      selected_end: null,
      start_date: null,
      end_date: null
    };
  }

  const availableStart = toDateOrNull(timelinePoints[0]);
  const availableEnd = toDateOrNull(timelinePoints[timelinePoints.length - 1]);
  let selectedStart = toDateOrNull(requestedStart) || availableStart;
  let selectedEnd = toDateOrNull(requestedEnd) || availableEnd;

  if (selectedStart < availableStart) {
    selectedStart = availableStart;
  }

  if (selectedStart > availableEnd) {
    selectedStart = availableEnd;
  }

  if (selectedEnd < availableStart) {
    selectedEnd = availableStart;
  }

  if (selectedEnd > availableEnd) {
    selectedEnd = availableEnd;
  }

  if (selectedStart > selectedEnd) {
    const swap = selectedStart;
    selectedStart = selectedEnd;
    selectedEnd = swap;
  }

  return {
    available_start: availableStart.toISOString(),
    available_end: availableEnd.toISOString(),
    selected_start: selectedStart.toISOString(),
    selected_end: selectedEnd.toISOString(),
    start_date: selectedStart,
    end_date: selectedEnd
  };
}

async function fetchDashboardDataForRange({ start, end } = {}) {
  const timeline = normalizeTimeline(await getTimelineSnapshots());
  const timelinePoints = timeline.points;
  const range = resolveRange(timelinePoints, start, end);

  if (!range.start_date || !range.end_date) {
    return {
      snapshot: null,
      chart: { labels: [], values: [] },
      range: {
        ...range,
        matched_snapshot_count: 0
      },
      timeline: {
        markers: timeline.markers,
        points: timelinePoints,
        count: timelinePoints.length
      }
    };
  }

  const snapshots = await getSnapshotsInRange(range.start_date, range.end_date);
  const snapshot = aggregateSnapshots(snapshots, range.selected_start, range.selected_end);
  const chart = buildChartData(snapshot);

  return {
    snapshot,
    chart,
    range: {
      ...range,
      matched_snapshot_count: snapshots.length
    },
    timeline: {
      markers: timeline.markers,
      points: timelinePoints,
      count: timelinePoints.length
    }
  };
}

module.exports = {
  fetchDashboardDataForRange
};
