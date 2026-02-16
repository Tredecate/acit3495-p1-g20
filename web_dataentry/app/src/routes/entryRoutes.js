const express = require("express");
const { getEntry, postEntry } = require("../controllers/entryController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/entry", requireAuth, getEntry);
router.post("/entry", requireAuth, postEntry);

module.exports = router;
