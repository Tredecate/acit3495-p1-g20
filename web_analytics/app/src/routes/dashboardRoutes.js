const express = require("express");
const { getDashboard, getDashboardData } = require("../controllers/dashboardController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/dashboard", requireAuth, getDashboard);
router.get("/dashboard/data", requireAuth, getDashboardData);

module.exports = router;
