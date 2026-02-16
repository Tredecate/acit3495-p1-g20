const mysql = require("mysql2/promise");
const { mysql: mysqlConfig } = require("../config/env");

const pool = mysql.createPool({
  host: mysqlConfig.host,
  port: mysqlConfig.port,
  user: mysqlConfig.user,
  password: mysqlConfig.password,
  database: mysqlConfig.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function pingDb() {
  await pool.query("SELECT 1");
}

module.exports = {
  pool,
  pingDb
};
