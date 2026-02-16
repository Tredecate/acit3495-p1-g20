const { fetchLatestDashboardData } = require("../services/analyticsService");

async function getDashboard(req, res, next) {
  try {
    const { snapshot, chart } = await fetchLatestDashboardData();
    return res.render("dashboard", {
      title: "Analytics Dashboard",
      snapshot,
      chart
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDashboard
};
