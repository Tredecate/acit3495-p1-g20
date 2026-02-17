const {
  listUsers,
  createUser,
  patchUser,
  isAuthError
} = require("../services/authClient");

function parseBooleanForm(value) {
  return value === "on" || value === "true";
}

async function getUsers(req, res, next) {
  try {
    const users = await listUsers(req.session.user.access_token);
    return res.render("admin-users", {
      title: "User Management",
      users,
      error: null,
      message: null
    });
  } catch (error) {
    if (error?.response?.status === 401) {
      req.session.destroy(() => res.redirect("/login"));
      return;
    }
    if (error?.response?.status === 403) {
      return res.status(403).render("error", {
        title: "Forbidden",
        error: "Admin access is required to manage users.",
        statusCode: 403
      });
    }
    return next(error);
  }
}

async function postUsers(req, res, next) {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";

  if (!username || !password) {
    try {
      const users = await listUsers(req.session.user.access_token);
      return res.status(400).render("admin-users", {
        title: "User Management",
        users,
        error: "Username and password are required.",
        message: null
      });
    } catch (error) {
      return next(error);
    }
  }

  try {
    await createUser(req.session.user.access_token, {
      username,
      password,
      is_admin: parseBooleanForm(req.body.is_admin),
      is_active: req.body.is_active !== "off"
    });
    return res.redirect("/admin/users");
  } catch (error) {
    if (isAuthError(error)) {
      if (error.response.status === 401) {
        req.session.destroy(() => res.redirect("/login"));
        return;
      }
      return res.status(403).render("error", {
        title: "Forbidden",
        error: "Admin access is required to manage users.",
        statusCode: 403
      });
    }

    try {
      const users = await listUsers(req.session.user.access_token);
      const fallbackMessage = "Unable to create user.";
      const message = error?.response?.data?.error?.message || fallbackMessage;
      return res.status(error?.response?.status || 400).render("admin-users", {
        title: "User Management",
        users,
        error: message,
        message: null
      });
    } catch (listError) {
      return next(listError);
    }
  }
}

async function patchUserController(req, res, next) {
  const username = req.params.username;
  const payload = {};

  if (req.body.password) {
    payload.password = req.body.password;
  }

  payload.is_admin = parseBooleanForm(req.body.is_admin);
  payload.is_active = parseBooleanForm(req.body.is_active);

  try {
    await patchUser(req.session.user.access_token, username, payload);
    return res.redirect("/admin/users");
  } catch (error) {
    if (isAuthError(error)) {
      if (error.response.status === 401) {
        req.session.destroy(() => res.redirect("/login"));
        return;
      }
      return res.status(403).render("error", {
        title: "Forbidden",
        error: "Admin access is required to manage users.",
        statusCode: 403
      });
    }

    try {
      const users = await listUsers(req.session.user.access_token);
      const fallbackMessage = "Unable to update user.";
      const message = error?.response?.data?.error?.message || fallbackMessage;
      return res.status(error?.response?.status || 400).render("admin-users", {
        title: "User Management",
        users,
        error: message,
        message: null
      });
    } catch (listError) {
      return next(listError);
    }
  }
}

module.exports = {
  getUsers,
  postUsers,
  patchUserController
};
