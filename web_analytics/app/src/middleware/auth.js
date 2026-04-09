const { me } = require("../services/authClient");
const { app: appConfig } = require("../config/env");

const ACCESS_TOKEN_COOKIE = "access_token";

function clearTokenCookie(res) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    secure: appConfig.cookieSecure,
    sameSite: "lax",
    path: appConfig.basePath || "/"
  });
}

function clearAndRedirect(req, res) {
  clearTokenCookie(res);
  res.redirect(req.baseUrl + "/login");
}

async function requireAuth(req, res, next) {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (!token) {
    return res.redirect(req.baseUrl + "/login");
  }

  try {
    const meResponse = await me(token);
    req.user = {
      access_token: token,
      username: meResponse.username,
      is_admin: meResponse.is_admin
    };
    res.locals.currentUser = req.user;
    return next();
  } catch (error) {
    if (error?.response?.status === 401) {
      return clearAndRedirect(req, res);
    }
    return next(error);
  }
}

module.exports = {
  requireAuth,
  clearTokenCookie,
  ACCESS_TOKEN_COOKIE
};
