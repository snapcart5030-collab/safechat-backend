const User = require("../models/User");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const AppSettings = require("../models/AppSettings");

const publicUser = "_id name email picture username bio role adminRequest createdAt lastSeen onlineStatus";

exports.requestAccess = async (req, res) => {
  const note = String(req.body?.note || "").trim().slice(0, 500);
  const user = req.user;
  if (user.role === "admin") return res.json({ success: true, status: "approved", message: "You already have administrator access." });
  if (user.adminRequest?.status === "pending") return res.status(409).json({ success: false, message: "Your request is already awaiting review." });

  user.adminRequest = { status: "pending", note, requestedAt: new Date(), reviewedAt: null, reviewedBy: null };
  await user.save();
  res.status(201).json({ success: true, status: "pending", message: "Your admin access request has been sent." });
};

exports.getMyAccess = async (req, res) => {
  res.json({ success: true, role: req.user.role, request: req.user.adminRequest || { status: "none" } });
};

exports.dashboard = async (_req, res) => {
  const [users, admins, pendingRequests, messages, unreadNotifications, recentUsers, recentRequests, settings] = await Promise.all([
    User.countDocuments(), User.countDocuments({ role: "admin" }), User.countDocuments({ "adminRequest.status": "pending" }),
    Message.countDocuments(), Notification.countDocuments({ isRead: false }),
    User.find().sort({ createdAt: -1 }).limit(6).select(publicUser).lean(),
    User.find({ "adminRequest.status": "pending" }).sort({ "adminRequest.requestedAt": -1 }).limit(6).select(publicUser).lean(),
    AppSettings.findOne().lean(),
  ]);
  res.json({ success: true, metrics: { users, admins, pendingRequests, messages, unreadNotifications }, recentUsers, recentRequests, settings: settings || { headerColor: "#8B1FF8" } });
};

exports.listUsers = async (req, res) => {
  const search = String(req.query.search || "").trim();
  const filter = search ? { $or: [{ name: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }, { username: { $regex: search, $options: "i" } }] } : {};
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(100).select(publicUser).lean();
  res.json({ success: true, users });
};

exports.listRequests = async (_req, res) => {
  const requests = await User.find({ "adminRequest.status": "pending" }).sort({ "adminRequest.requestedAt": -1 }).select(publicUser).lean();
  res.json({ success: true, requests });
};

exports.reviewRequest = async (req, res) => {
  const { decision } = req.body;
  if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ success: false, message: "Choose approved or rejected." });
  const target = await User.findById(req.params.userId);
  if (!target) return res.status(404).json({ success: false, message: "User not found." });
  target.role = decision === "approved" ? "admin" : "user";
  target.adminRequest = { ...target.adminRequest.toObject(), status: decision, reviewedAt: new Date(), reviewedBy: req.user._id };
  await target.save();
  res.json({ success: true, user: target.toObject() });
};

exports.updateSettings = async (req, res) => {
  const headerColor = String(req.body?.headerColor || "");
  if (!/^#[0-9A-Fa-f]{6}$/.test(headerColor)) return res.status(400).json({ success: false, message: "Use a six-digit hex colour." });
  const settings = await AppSettings.findOneAndUpdate({}, { headerColor }, { new: true, upsert: true });
  res.json({ success: true, settings });
};
