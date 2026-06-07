const express = require("express");

const router =
  express.Router();

const {
  sendFollowRequest,
  getFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest,
  getAcceptedUsers,
} = require(
  "../controllers/followController"
);

router.post(
  "/send-request",
  sendFollowRequest
);

router.get(
  "/requests/:userId",
  getFollowRequests
);

router.post(
  "/accept-request",
  acceptFollowRequest
);

router.post(
  "/reject-request",
  rejectFollowRequest
);
router.get(
  "/accepted/:userId",
  getAcceptedUsers
);

module.exports = router;