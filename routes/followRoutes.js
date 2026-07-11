const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const {
  sendFollowRequest,
  getFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest,
  getAcceptedUsers,
  getFollowers,
  getAllConnections,
  unfollowUser,
  checkFollowingStatus,
  getMutualFriends,
} = require("../controllers/followController");

router.use(protect);

const currentId = (req) => req.user._id.toString();
const requireParamOwner = (param) => (req, res, next) => {
  if (req.params[param] !== currentId(req)) return res.status(403).json({ success: false, message: "Not authorized" });
  next();
};
const setBodyOwner = (field) => (req, res, next) => {
  req.body[field] = currentId(req);
  next();
};

// Send follow request (with mutual follow detection)
router.post("/send-request", setBodyOwner("senderId"), sendFollowRequest);

// Get pending follow requests for a user
router.get("/requests/:userId", requireParamOwner("userId"), getFollowRequests);

// Accept follow request
router.post("/accept-request", setBodyOwner("currentUserId"), acceptFollowRequest);

// Reject follow request
router.post("/reject-request", setBodyOwner("currentUserId"), rejectFollowRequest);

// Get users that the current user is following
router.get("/accepted/:userId", requireParamOwner("userId"), getAcceptedUsers);

// Get users following the current user
router.get("/followers/:userId", requireParamOwner("userId"), getFollowers);

// Get all connections (mutual + following + followers)
router.get("/connections/:userId", requireParamOwner("userId"), getAllConnections);

// Unfollow a user
router.post("/unfollow", setBodyOwner("currentUserId"), unfollowUser);

// Check if following a user
router.get("/status/:currentUserId/:targetUserId", requireParamOwner("currentUserId"), checkFollowingStatus);

// Get mutual friends
router.get("/mutual/:userId", requireParamOwner("userId"), getMutualFriends);

module.exports = router;
router.get("/mutual/:userId", getMutualFriends);
  
module.exports = router;
