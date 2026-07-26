const express = require("express");
const Admin = require("../models/Admin");
const FollowRequest = require("../models/FollowRequest");
const VerificationRequest = require("../models/VerificationRequest");
const Chat = require("../models/Chat");
const AdminMessage = require("../models/AdminMessage");
const Report = require("../models/Report");
const User = require("../models/User"); // ✅ ADD THIS - it was missing!

// ✅ CORRECT PATH - with 's' in middlewares
const { protectAdmin } = require("../middlewares/adminAuthMiddleware");

const router = express.Router();
router.use(protectAdmin);

// ---- Stats ----
router.get("/stats", async (req, res) => {
  try {
    const [totalUsers, bannedUsers, pendingFollow, pendingSignup] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: "banned" }),
      FollowRequest.countDocuments({ status: "pending" }),
      VerificationRequest.countDocuments({ status: "pending" }),
    ]);

    const since = new Date(Date.now() - 7 * 86400000);
    const newSignups7d = await User.countDocuments({ createdAt: { $gte: since } });

    const activeSince = new Date(Date.now() - 15 * 60000);
    const activeToday = await User.countDocuments({ lastActive: { $gte: activeSince } });

    const totalMessages = await AdminMessage.countDocuments();

    res.json({
      totalUsers,
      activeToday,
      totalMessages,
      pendingRequests: pendingFollow + pendingSignup,
      bannedUsers,
      newSignups7d,
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ---- Users ----
router.get("/users", async (req, res) => {
  try {
    const { q, status } = req.query;
    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (q) filter.$or = [{ username: new RegExp(q, "i") }, { email: new RegExp(q, "i") }];

    const users = await User.find(filter).select("-password").sort({ createdAt: -1 });
    const shaped = users.map((u) => ({
      _id: u._id,
      username: u.username,
      email: u.email,
      avatar: u.picture,
      followers: u.followers?.length || 0,
      following: u.following?.length || 0,
      status: u.onlineStatus,
      verified: u.verified || false,
      joined: u.createdAt,
      lastActive: u.lastActive,
    }));
    res.json(shaped);
  } catch (error) {
    console.error("Users error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/users/:id", async (req, res) => {
  try {
    const u = await User.findById(req.params.id).select("-password");
    if (!u) return res.status(404).json({ message: "User not found" });
    res.json({
      _id: u._id,
      username: u.username,
      email: u.email,
      avatar: u.avatar,
      followers: u.followers?.length || 0,
      following: u.following?.length || 0,
      status: u.status,
      verified: u.verified || false,
      joined: u.createdAt,
      lastActive: u.lastActive,
    });
  } catch (error) {
    console.error("User detail error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.patch("/users/:id/ban", async (req, res) => {
  try {
    const u = await User.findByIdAndUpdate(
      req.params.id, 
      { status: "banned" }, 
      { new: true }
    );
    if (!u) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User banned", user: u });
  } catch (error) {
    console.error("Ban error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.patch("/users/:id/unban", async (req, res) => {
  try {
    const u = await User.findByIdAndUpdate(
      req.params.id, 
      { status: "active" }, 
      { new: true }
    );
    if (!u) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User unbanned", user: u });
  } catch (error) {
    console.error("Unban error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.patch("/users/:id/verify", async (req, res) => {
  try {
    const u = await User.findByIdAndUpdate(
      req.params.id, 
      { verified: true }, 
      { new: true }
    );
    if (!u) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User verified", user: u });
  } catch (error) {
    console.error("Verify error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ---- Requests ----
router.get("/follow-requests", async (req, res) => {
  try {
    const requests = await FollowRequest.find({ status: "pending" })
      .populate("from", "username avatar")
      .populate("to", "username avatar")
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error("Follow requests error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/signup-requests", async (req, res) => {
  try {
    const requests = await VerificationRequest.find({ status: "pending" })
      .populate("user", "username email avatar")
      .sort({ createdAt: -1 });

    const shaped = requests.map((r) => ({
      _id: r._id,
      username: r.user?.username,
      email: r.user?.email,
      createdAt: r.createdAt,
    }));
    res.json(shaped);
  } catch (error) {
    console.error("Signup requests error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

async function resolveRequest(id, decision) {
  const followReq = await FollowRequest.findById(id);
  if (followReq) {
    followReq.status = decision;
    await followReq.save();
    if (decision === "approved") {
      await User.findByIdAndUpdate(followReq.to, { $addToSet: { followers: followReq.from } });
      await User.findByIdAndUpdate(followReq.from, { $addToSet: { following: followReq.to } });
    }
    return true;
  }

  const verifyReq = await VerificationRequest.findById(id);
  if (verifyReq) {
    verifyReq.status = decision;
    await verifyReq.save();
    if (decision === "approved") {
      await User.findByIdAndUpdate(verifyReq.user, { verified: true });
    }
    return true;
  }

  return false;
}

router.post("/requests/:id/approve", async (req, res) => {
  try {
    const found = await resolveRequest(req.params.id, "approved");
    if (!found) return res.status(404).json({ message: "Request not found" });
    res.json({ message: "Request approved" });
  } catch (error) {
    console.error("Approve request error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/requests/:id/reject", async (req, res) => {
  try {
    const found = await resolveRequest(req.params.id, "rejected");
    if (!found) return res.status(404).json({ message: "Request not found" });
    res.json({ message: "Request rejected" });
  } catch (error) {
    console.error("Reject request error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ---- Chats ----
router.get("/chats", async (req, res) => {
  try {
    const chats = await Chat.find()
      .populate("participants", "username avatar")
      .sort({ lastMessageAt: -1 })
      .limit(100);
    const shaped = chats.map((c) => ({
      _id: c._id,
      participants: c.participants,
      lastMessage: c.lastMessage,
      updatedAt: c.lastMessageAt,
    }));
    res.json(shaped);
  } catch (error) {
    console.error("Chats error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/chats/:chatId/messages", async (req, res) => {
  try {
    const messages = await AdminMessage.find({ chat: req.params.chatId })
      .populate("sender", "username avatar")
      .sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    console.error("Messages error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ---- Reports ----
router.get("/reports", async (req, res) => {
  try {
    const reports = await Report.find({ status: "open" })
      .populate({ path: "chat", populate: { path: "participants", select: "username avatar" } })
      .sort({ createdAt: -1 });

    const shaped = reports.map((r) => ({
      _id: r._id,
      participants: r.chat?.participants || [],
      lastMessage: r.chat?.lastMessage || r.reason,
    }));
    res.json(shaped);
  } catch (error) {
    console.error("Reports error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.patch("/reports/:id/resolve", async (req, res) => {
  try {
    await Report.findByIdAndUpdate(req.params.id, { status: "resolved" });
    res.json({ message: "Report resolved" });
  } catch (error) {
    console.error("Resolve report error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ---- Settings ----
router.get("/settings", async (req, res) => {
  try {
    res.json({
      appName: "SafeChat",
      adminEmail: req.admin?.email || "admin@safechat.app",
      environment: process.env.NODE_ENV || "production",
    });
  } catch (error) {
    console.error("Settings error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ---- Admin Requests ----
router.get("/admin-requests", async (req, res) => {
  try {
    const pendingAdmins = await Admin.find({ status: "pending" }).sort({ createdAt: -1 });
    res.json(pendingAdmins);
  } catch (error) {
    console.error("Admin requests fetch error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/admin-requests/:id/approve", async (req, res) => {
  try {
    const admin = await Admin.findByIdAndUpdate(req.params.id, { status: "approved" }, { new: true });
    if (!admin) return res.status(404).json({ message: "Admin request not found" });
    res.json({ message: "Admin request approved", admin });
  } catch (error) {
    console.error("Approve admin request error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/admin-requests/:id/reject", async (req, res) => {
  try {
    const admin = await Admin.findByIdAndUpdate(req.params.id, { status: "rejected" }, { new: true });
    if (!admin) return res.status(404).json({ message: "Admin request not found" });
    res.json({ message: "Admin request rejected", admin });
  } catch (error) {
    console.error("Reject admin request error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;