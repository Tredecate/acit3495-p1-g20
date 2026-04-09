const { login } = require("../services/authClient");
const { app: appConfig } = require("../config/env");
const { clearTokenCookie, ACCESS_TOKEN_COOKIE } = require("../middleware/auth");

function setTokenCookie(res, token, ttlSeconds) {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: appConfig.cookieSecure,
    sameSite: "lax",
    path: appConfig.basePath || "/",
    maxAge: (ttlSeconds || 3600) * 1000
  });
}

function getLogin(req, res) {
  if (req.cookies?.[ACCESS_TOKEN_COOKIE]) {
    return res.redirect(req.baseUrl + "/entry");
  }
  return res.render("login", { title: "Login" });
}

async function postLogin(req, res, next) {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";

  if (!username || !password) {
    return res.status(400).render("login", {
      title: "Login",
      error: "Username and password are required."
    });
  }

  try {
    const authResponse = await login(username, password);
    setTokenCookie(res, authResponse.access_token, authResponse.expires_in);
    return res.redirect(req.baseUrl + "/entry");
  } catch (error) {
    if (error?.response?.status === 401) {
      return res.status(401).render("login", {
        title: "Login",
        error: "Invalid username or password."
      });
    }
    return next(error);
  }
}

function postLogout(req, res) {
  clearTokenCookie(res);
  return res.redirect(req.baseUrl + "/login");
}

module.exports = {
  getLogin,
  postLogin,
  postLogout
};
