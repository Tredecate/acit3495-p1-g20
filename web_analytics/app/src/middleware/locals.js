const { app: appConfig } = require("../config/env");

function attachLocals(req, res, next) {
  res.locals.currentUser = req.user || null;
  res.locals.basePath = appConfig.basePath;
  res.locals.error = null;
  next();
}

module.exports = {
  attachLocals
};
