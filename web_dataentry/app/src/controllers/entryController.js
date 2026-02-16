const { pool } = require("../db/mysql");
const { ALLOWED_METRIC_TYPES } = require("../config/constants");
const { validateReading } = require("../validation/readingValidation");
const { toMySqlDateTime } = require("../utils/datetime");

function getEntry(req, res) {
  return res.render("entry", {
    title: "Data Entry",
    metricTypes: ALLOWED_METRIC_TYPES,
    error: null,
    message: null,
    values: {
      recorded_at: "",
      location: "",
      metric_type: ALLOWED_METRIC_TYPES[0],
      metric_value: "",
      notes: ""
    }
  });
}

async function postEntry(req, res, next) {
  const validation = validateReading(req.body);
  const { normalized } = validation;

  if (!validation.isValid) {
    return res.status(400).render("entry", {
      title: "Data Entry",
      metricTypes: ALLOWED_METRIC_TYPES,
      error: validation.errors.join(". "),
      message: null,
      values: {
        recorded_at: normalized.recordedAtInput || "",
        location: normalized.location,
        metric_type: normalized.metricType || ALLOWED_METRIC_TYPES[0],
        metric_value: Number.isFinite(normalized.metricValue) ? String(normalized.metricValue) : "",
        notes: normalized.notes || ""
      }
    });
  }

  const recordedAt = toMySqlDateTime(normalized.recordedAtInput);
  if (!recordedAt) {
    return res.status(400).render("entry", {
      title: "Data Entry",
      metricTypes: ALLOWED_METRIC_TYPES,
      error: "recorded_at must be a valid date/time.",
      message: null,
      values: {
        recorded_at: normalized.recordedAtInput,
        location: normalized.location,
        metric_type: normalized.metricType,
        metric_value: String(normalized.metricValue),
        notes: normalized.notes || ""
      }
    });
  }

  try {
    await pool.execute(
      `INSERT INTO readings (
        recorded_at,
        location,
        metric_type,
        metric_value,
        notes,
        entered_by
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        recordedAt,
        normalized.location,
        normalized.metricType,
        normalized.metricValue,
        normalized.notes,
        req.session.user.username
      ]
    );

    return res.render("entry", {
      title: "Data Entry",
      metricTypes: ALLOWED_METRIC_TYPES,
      error: null,
      message: "Reading submitted successfully.",
      values: {
        recorded_at: "",
        location: "",
        metric_type: ALLOWED_METRIC_TYPES[0],
        metric_value: "",
        notes: ""
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getEntry,
  postEntry
};
