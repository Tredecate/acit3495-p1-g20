const express = require("express");
const {
  getLogin,
  postLogin,
  postLogout
} = require("../controllers/authController");

const router = express.Router();

router.get("/login", getLogin);
router.post("/login", postLogin);
router.post("/logout", postLogout);

module.exports = router;
