const express = require("express");

const router =
  express.Router();

const {
  sendFollowRequest,
  getFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest,
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

module.exports = router;