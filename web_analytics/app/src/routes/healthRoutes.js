const express = require("express");
const { pingDb } = require("../db/mongo");

const router = express.Router();

router.get("/health", async (req, res, next) => {
  try {
    await pingDb();
    return res.json({
      status: "ok",
      service: "web_analytics",
      db: "ok"
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
