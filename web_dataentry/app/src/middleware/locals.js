function attachLocals(req, res, next) {
  res.locals.currentUser = req.session?.user || null;
  res.locals.error = null;
  res.locals.message = null;
  next();
}

module.exports = {
  attachLocals
};
