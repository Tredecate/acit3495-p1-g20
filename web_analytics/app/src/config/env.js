const dotenv = require("dotenv");

dotenv.config();

function parsePort(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeBasePath(value) {
  if (!value) return "";
  let v = value.trim();
  if (!v) return "";
  if (!v.startsWith("/")) v = "/" + v;
  if (v.endsWith("/")) v = v.slice(0, -1);
  return v;
}

module.exports = {
  app: {
    port: parsePort(process.env.PORT, 8080),
    basePath: normalizeBasePath(process.env.BASE_PATH || ""),
    cookieSecure: (process.env.COOKIE_SECURE || "false").toLowerCase() === "true",
    trustProxy: (process.env.TRUST_PROXY || "false").toLowerCase() === "true"
  },
  auth: {
    host: process.env.AUTH_HOST_ADDR || "svc-auth",
    port: parsePort(process.env.AUTH_PORT, 8080)
  },
  mongo: {
    host: process.env.MONGO_HOST_ADDR || "mongodb-service",
    port: parsePort(process.env.MONGO_PORT, 27017),
    database: required("MONGO_INITDB_DATABASE"),
    user: required("MONGO_INITDB_ROOT_USERNAME"),
    password: required("MONGO_INITDB_ROOT_PASSWORD")
  }
};
