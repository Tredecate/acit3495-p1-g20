const { login } = require("../services/authClient");

function getLogin(req, res) {
  if (req.session?.user?.access_token) {
    return res.redirect("/entry");
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
    req.session.user = {
      access_token: authResponse.access_token,
      username: authResponse.user.username,
      is_admin: authResponse.user.is_admin
    };
    return res.redirect("/entry");
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
  req.session.destroy(() => {
    res.redirect("/login");
  });
}

module.exports = {
  getLogin,
  postLogin,
  postLogout
};
