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

module.exports = {
  app: {
    port: parsePort(process.env.PORT, 8080),
    sessionSecret: required("SESSION_SECRET")
  },
  auth: {
    host: process.env.AUTH_HOST_ADDR || "svc_authentication",
    port: parsePort(process.env.AUTH_PORT, 8080)
  },
  mongo: {
    host: process.env.MONGO_HOST_ADDR || "db_mongodb",
    port: parsePort(process.env.MONGO_PORT, 27017),
    database: required("MONGO_INITDB_DATABASE"),
    user: required("MONGO_INITDB_ROOT_USERNAME"),
    password: required("MONGO_INITDB_ROOT_PASSWORD")
  }
};
