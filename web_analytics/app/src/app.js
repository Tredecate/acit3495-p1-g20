const path = require("path");
const express = require("express");
const session = require("express-session");

const { app: appConfig } = require("./config/env");
const { attachLocals } = require("./middleware/locals");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const healthRoutes = require("./routes/healthRoutes");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/static", express.static(path.join(__dirname, "..", "public")));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(
  session({
    secret: appConfig.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax"
    }
  })
);

app.use(attachLocals);

app.get("/", (req, res) => {
  if (req.session?.user?.access_token) {
    return res.redirect("/dashboard");
  }
  return res.redirect("/login");
});

app.use(authRoutes);
app.use(dashboardRoutes);
app.use(healthRoutes);

app.use((req, res) => {
  res.status(404).render("error", {
    title: "Not Found",
    error: "Page not found.",
    statusCode: 404
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  const statusCode = err?.response?.status || 500;
  const message = err?.response?.data?.error?.message || "Unexpected server error.";

  res.status(statusCode).render("error", {
    title: "Error",
    error: message,
    statusCode
  });
});

module.exports = app;
