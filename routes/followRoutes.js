const express = require("express");
const router = express.Router();
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

// Send follow request
router.post("/send-request", sendFollowRequest);

// Get pending follow requests for a user
router.get("/requests/:userId", getFollowRequests);

// Accept follow request
router.post("/accept-request", acceptFollowRequest);

// Reject follow request
router.post("/reject-request", rejectFollowRequest);

// Get users that the current user is following
router.get("/accepted/:userId", getAcceptedUsers);

// Get users following the current user
router.get("/followers/:userId", getFollowers);

// Get all connections (mutual + following + followers)
router.get("/connections/:userId", getAllConnections);

// Unfollow a user
router.post("/unfollow", unfollowUser);

// Check if following a user
router.get("/status/:currentUserId/:targetUserId", checkFollowingStatus);

// Get mutual friends
router.get("/mutual/:userId", getMutualFriends);

module.exports = router;