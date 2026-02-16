const { DateTime, FixedOffsetZone } = require("luxon");

function toMySqlDateTime(input, timezoneOffsetMinutes = null) {
  if (typeof input !== "string") {
    return null;
  }

  const normalizedInput = input.length === 16 ? `${input}:00` : input;

  if (Number.isInteger(timezoneOffsetMinutes)) {
    const zone = FixedOffsetZone.instance(-timezoneOffsetMinutes);
    const dateTime = DateTime.fromFormat(normalizedInput, "yyyy-MM-dd'T'HH:mm:ss", { zone });
    if (!dateTime.isValid) {
      return null;
    }

    return dateTime.toUTC().toFormat("yyyy-MM-dd HH:mm:ss");
  }

  const fallbackDateTime = DateTime.fromISO(normalizedInput);
  if (!fallbackDateTime.isValid) {
    return null;
  }

  return fallbackDateTime.toUTC().toFormat("yyyy-MM-dd HH:mm:ss");
}

module.exports = {
  toMySqlDateTime
};
