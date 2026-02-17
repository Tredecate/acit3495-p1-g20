const { fetchDashboardDataForRange } = require("../services/analyticsService");

async function getDashboard(req, res, next) {
  try {
    const { snapshot, chart, range, timeline } = await fetchDashboardDataForRange({
      start: req.query.start,
      end: req.query.end
    });

    return res.render("dashboard", {
      title: "Analytics Dashboard",
      snapshot,
      chart,
      range,
      timeline
    });
  } catch (error) {
    return next(error);
  }
}

async function getDashboardData(req, res, next) {
  try {
    const data = await fetchDashboardDataForRange({
      start: req.query.start,
      end: req.query.end
    });

    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDashboard,
  getDashboardData
};
