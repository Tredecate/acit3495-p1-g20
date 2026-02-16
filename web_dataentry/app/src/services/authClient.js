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

async function listUsers(token) {
  const response = await client.get("/users", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
}

async function createUser(token, payload) {
  const response = await client.post("/users", payload, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
}

async function patchUser(token, username, payload) {
  const response = await client.patch(`/users/${encodeURIComponent(username)}`, payload, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
}

function isAuthError(error) {
  return Boolean(error?.response?.status) && [401, 403].includes(error.response.status);
}

module.exports = {
  login,
  me,
  listUsers,
  createUser,
  patchUser,
  isAuthError
};
