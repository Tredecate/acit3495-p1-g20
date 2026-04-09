const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");

const { app: appConfig } = require("./config/env");
const { attachLocals } = require("./middleware/locals");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const healthRoutes = require("./routes/healthRoutes");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

if (appConfig.trustProxy) {
  app.set("trust proxy", 1);
}

// Static files served at <basePath>/static so dashboard.ejs asset URLs match.
app.use((appConfig.basePath || "") + "/static", express.static(path.join(__dirname, "..", "public")));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());

app.use(healthRoutes);

const router = express.Router();
router.use(attachLocals);

router.get("/", (req, res) => {
  if (req.cookies?.access_token) {
    return res.redirect(req.baseUrl + "/dashboard");
  }
  return res.redirect(req.baseUrl + "/login");
});

router.use(authRoutes);
router.use(dashboardRoutes);

app.use(appConfig.basePath || "/", router);

app.use((req, res) => {
  res.status(404).render("error", {
    title: "Not Found",
    error: "Page not found.",
    statusCode: 404,
    basePath: appConfig.basePath,
    currentUser: null
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  const statusCode = err?.response?.status || 500;
  const message = err?.response?.data?.error?.message || "Unexpected server error.";

  res.status(statusCode).render("error", {
    title: "Error",
    error: message,
    statusCode,
    basePath: appConfig.basePath,
    currentUser: null
  });
});

module.exports = app;
