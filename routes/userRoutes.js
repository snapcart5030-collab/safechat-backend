const express = require("express");
const upload = require("../config/upload");

const router =
  express.Router();

const {
  getUsers,
  updateProfile,
  searchUsers,
} = require(
  "../controllers/userController"
);

router.get("/", getUsers);

router.get(
  "/search",
  searchUsers
);

router.put(
  "/update-profile",
  updateProfile
);

router.put(
  "/upload-profile",
  upload.single("image"),
  async (req, res) => {
    res.json({
      imageUrl:
        req.file.path,
    });
  }
);

module.exports = router;