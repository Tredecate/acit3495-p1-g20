const axios = require("axios");
const { auth } = require("../config/env");

const client = axios.create({
  baseURL: `http://${auth.host}:${auth.port}`,
  timeout: 5000
});

async function login(username, password) {
  const response = await client.post("/auth/login", { username, password });
  return response.data;
}

async function me(token) {
  const response = await client.get("/auth/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
}

module.exports = {
  login,
  me
};
