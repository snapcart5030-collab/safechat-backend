const express = require("express");
const upload = require("../config/upload");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

const {
  getUsers,
  getUserById,
  updateProfile,
  searchUsers,
  blockUser,
  unblockUser,
  getBlockedUsers,
  checkBlockStatus,
} = require("../controllers/userController");

// Secure all user routes
router.use(protect);

const owns = (value) => (req, res, next) => {
  if (value(req) !== req.user._id.toString()) return res.status(403).json({ success: false, message: "Not authorized" });
  next();
};

router.get("/", getUsers);
router.get("/search", (req, res, next) => { req.query.currentUserId = req.user._id.toString(); next(); }, searchUsers);
router.post("/block", blockUser);
router.post("/unblock", unblockUser);
router.get("/blocked/:id", owns((req) => req.params.id), getBlockedUsers);
router.get("/:id", getUserById); // IMPORTANT: this must come AFTER /search
router.put("/update-profile", (req, res, next) => { req.body.id = req.user._id.toString(); next(); }, updateProfile);

router.put("/upload-profile", upload.single("image"), async (req, res) => {
  res.json({
    imageUrl: req.file.path,
  });
});

router.get("/block-status/:userId/:targetUserId", owns((req) => req.params.userId), checkBlockStatus);

module.exports = router;
