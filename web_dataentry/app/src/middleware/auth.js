const { me } = require("../services/authClient");

function clearSessionAndRedirect(req, res) {
  req.session.destroy(() => {
    res.redirect("/login");
  });
}

async function requireAuth(req, res, next) {
  const user = req.session?.user;
  if (!user?.access_token) {
    return res.redirect("/login");
  }

  try {
    const meResponse = await me(user.access_token);
    req.session.user.username = meResponse.username;
    req.session.user.is_admin = meResponse.is_admin;
    return next();
  } catch (error) {
    if (error?.response?.status === 401) {
      return clearSessionAndRedirect(req, res);
    }
    return next(error);
  }
}

async function requireAdmin(req, res, next) {
  const user = req.session?.user;
  if (!user?.is_admin) {
    return res.status(403).render("error", {
      title: "Forbidden",
      error: "Admin access is required to view this page.",
      statusCode: 403
    });
  }

  return next();
}

module.exports = {
  requireAuth,
  requireAdmin
};
