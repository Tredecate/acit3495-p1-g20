const express = require("express");
const {
  getUsers,
  postUsers,
  patchUserController
} = require("../controllers/adminController");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/admin/users", requireAuth, requireAdmin, getUsers);
router.post("/admin/users", requireAuth, requireAdmin, postUsers);
router.post("/admin/users/:username", requireAuth, requireAdmin, patchUserController);

module.exports = router;
