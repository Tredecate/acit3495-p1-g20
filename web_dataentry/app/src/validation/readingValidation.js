const { ALLOWED_METRIC_TYPES } = require("../config/constants");

function validateReading(input) {
  const errors = [];
  const location = (input.location || "").trim();
  const metricType = (input.metric_type || "").trim();
  const metricValueRaw = String(input.metric_value || "").trim();
  const notes = (input.notes || "").trim();
  const recordedAtInput = input.recorded_at;
  const timezoneOffsetRaw = input.timezone_offset_min;

  if (!recordedAtInput) {
    errors.push("recorded_at is required");
  }

  if (!location || location.length > 100) {
    errors.push("location must be between 1 and 100 characters");
  }

  if (!ALLOWED_METRIC_TYPES.includes(metricType)) {
    errors.push("metric_type is invalid");
  }

  const metricValue = Number(metricValueRaw);
  if (!Number.isFinite(metricValue)) {
    errors.push("metric_value must be a number");
  }

  let timezoneOffsetMinutes = null;
  if (timezoneOffsetRaw !== undefined && timezoneOffsetRaw !== null && String(timezoneOffsetRaw).trim() !== "") {
    const offset = Number(String(timezoneOffsetRaw).trim());
    if (!Number.isInteger(offset) || offset < -840 || offset > 840) {
      errors.push("timezone_offset_min is invalid");
    } else {
      timezoneOffsetMinutes = offset;
    }
  }

  if (notes.length > 255) {
    errors.push("notes must be 255 characters or fewer");
  }

  return {
    isValid: errors.length === 0,
    errors,
    normalized: {
      recordedAtInput,
      timezoneOffsetMinutes,
      location,
      metricType,
      metricValue,
      notes: notes || null
    }
  };
}

module.exports = {
  validateReading
};
