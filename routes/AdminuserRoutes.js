const express = require("express");
const User = require("../models/User");
const FollowRequest = require("../models/FollowRequest");
const VerificationRequest = require("../models/VerificationRequest");
const { protectUser } = require("../middleware/auth");

const router = express.Router();

// Get a profile
router.get("/:id", protectUser, async (req, res) => {
  const user = await User.findById(req.params.id)
    .select("-password")
    .populate("followers", "username avatar")
    .populate("following", "username avatar");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
});

// Follow / send follow request
router.post("/:id/follow", protectUser, async (req, res) => {
  const targetId = req.params.id;
  if (targetId === String(req.user._id)) {
    return res.status(400).json({ message: "You can't follow yourself" });
  }

  const target = await User.findById(targetId);
  if (!target) return res.status(404).json({ message: "User not found" });

  if (target.followers.includes(req.user._id)) {
    return res.status(400).json({ message: "Already following this user" });
  }

  if (target.isPrivate) {
    const existing = await FollowRequest.findOne({ from: req.user._id, to: targetId, status: "pending" });
    if (existing) return res.status(400).json({ message: "Follow request already sent" });

    const request = await FollowRequest.create({ from: req.user._id, to: targetId });
    const populated = await request.populate([
      { path: "from", select: "username avatar" },
      { path: "to", select: "username avatar" },
    ]);

    req.app.get("io")?.to("admins").emit("admin:followRequest", populated);
    req.app.get("io")?.to(`user:${targetId}`).emit("followRequest", populated);

    return res.status(201).json({ message: "Follow request sent", request: populated });
  }

  target.followers.push(req.user._id);
  req.user.following.push(targetId);
  await target.save();
  await req.user.save();

  res.json({ message: "Now following", following: true });
});

// Unfollow
router.post("/:id/unfollow", protectUser, async (req, res) => {
  const targetId = req.params.id;
  await User.findByIdAndUpdate(targetId, { $pull: { followers: req.user._id } });
  await User.findByIdAndUpdate(req.user._id, { $pull: { following: targetId } });
  res.json({ message: "Unfollowed", following: false });
});

// Accept / reject a follow request (target user does this themself)
router.post("/follow-requests/:requestId/:action", protectUser, async (req, res) => {
  const { requestId, action } = req.params;
  if (!["accept", "reject"].includes(action)) {
    return res.status(400).json({ message: "Invalid action" });
  }

  const request = await FollowRequest.findById(requestId);
  if (!request) return res.status(404).json({ message: "Request not found" });
  if (String(request.to) !== String(req.user._id)) {
    return res.status(403).json({ message: "Not your request to manage" });
  }

  if (action === "accept") {
    request.status = "approved";
    await User.findByIdAndUpdate(request.to, { $addToSet: { followers: request.from } });
    await User.findByIdAndUpdate(request.from, { $addToSet: { following: request.to } });
  } else {
    request.status = "rejected";
  }
  await request.save();

  res.json({ message: `Request ${action}ed`, request });
});

// Request the verified badge
router.post("/verification-request", protectUser, async (req, res) => {
  const existing = await VerificationRequest.findOne({ user: req.user._id, status: "pending" });
  if (existing) return res.status(400).json({ message: "You already have a pending request" });

  const request = await VerificationRequest.create({ user: req.user._id, reason: req.body.reason || "" });
  const populated = await request.populate("user", "username email avatar");

  req.app.get("io")?.to("admins").emit("admin:signupRequest", populated);

  res.status(201).json({ message: "Verification request submitted", request: populated });
});

module.exports = router;
