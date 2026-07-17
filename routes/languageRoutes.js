const express = require("express");
const router = express.Router();

const {
  updateLanguage,
  getLanguage,
} = require("../controllers/languageController");

router.post("/update", updateLanguage);
router.get("/:userId", getLanguage);

module.exports = router;