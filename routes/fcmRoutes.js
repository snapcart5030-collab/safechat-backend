const express = require("express");
const router = express.Router();

const {
  saveToken,
} = require("../controllers/fcmController");

router.post("/save-token", saveToken);

module.exports = router;