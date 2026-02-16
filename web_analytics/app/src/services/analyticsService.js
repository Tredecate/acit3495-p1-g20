const { getLatestSnapshot } = require("../db/mongo");

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

async function fetchLatestDashboardData() {
  const snapshot = normalizeSnapshot(await getLatestSnapshot());
  const chart = buildChartData(snapshot);
  return { snapshot, chart };
}

module.exports = {
  fetchLatestDashboardData
};
