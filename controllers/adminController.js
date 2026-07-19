// controllers/adminController.js

const User = require("../models/User");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const AppSettings = require("../models/AppSettings");

const publicUser = "_id name email picture username bio role adminRequest createdAt lastSeen onlineStatus isSuspended suspendedAt suspensionReason";

// ========== GET ADMIN ACCESS STATUS ==========
exports.getMyAccess = async (req, res) => {
  try {
    res.json({
      success: true,
      role: req.user.role,
      request: req.user.adminRequest || { status: "none" }
    });
  } catch (error) {
    console.error("Get access error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ========== REQUEST ADMIN ACCESS ==========
exports.requestAccess = async (req, res) => {
  try {
    const note = String(req.body?.note || "").trim().slice(0, 500);
    const user = req.user;

    if (user.role === "admin") {
      return res.json({
        success: true,
        status: "approved",
        message: "You already have administrator access."
      });
    }

    if (user.adminRequest?.status === "pending") {
      return res.status(409).json({
        success: false,
        message: "Your request is already awaiting review."
      });
    }

    user.adminRequest = {
      status: "pending",
      note: note,
      requestedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null
    };
    await user.save();

    res.status(201).json({
      success: true,
      status: "pending",
      message: "Your admin access request has been sent."
    });
  } catch (error) {
    console.error("Request access error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ========== DASHBOARD - Get all metrics ==========
exports.dashboard = async (_req, res) => {
  try {
    const [users, admins, pendingRequests, messages, unreadNotifications, recentUsers, recentRequests, settings] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ "adminRequest.status": "pending" }),
      Message.countDocuments(),
      Notification.countDocuments({ isRead: false }),
      User.find().sort({ createdAt: -1 }).limit(6).select(publicUser).lean(),
      User.find({ "adminRequest.status": "pending" }).sort({ "adminRequest.requestedAt": -1 }).limit(6).select(publicUser).lean(),
      AppSettings.findOne().lean(),
    ]);

    res.json({
      success: true,
      metrics: {
        users,
        admins,
        pendingRequests,
        messages,
        unreadNotifications
      },
      recentUsers,
      recentRequests,
      settings: settings || { headerColor: "#8B1FF8" }
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ========== LIST ALL USERS ==========
exports.listUsers = async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const filter = search ? {
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } }
      ]
    } : {};

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .select(publicUser)
      .lean();

    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ========== LIST PENDING REQUESTS ==========
exports.listRequests = async (_req, res) => {
  try {
    const requests = await User.find({ "adminRequest.status": "pending" })
      .sort({ "adminRequest.requestedAt": -1 })
      .select(publicUser)
      .lean();

    res.json({
      success: true,
      requests
    });
  } catch (error) {
    console.error("List requests error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ========== REVIEW ADMIN REQUEST ==========
exports.reviewRequest = async (req, res) => {
  try {
    const { decision } = req.body;

    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Choose approved or rejected."
      });
    }

    const target = await User.findById(req.params.userId);
    if (!target) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    // Cannot review your own request
    if (target._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot review your own request."
      });
    }

    target.role = decision === "approved" ? "admin" : "user";
    target.adminRequest = {
      ...target.adminRequest.toObject(),
      status: decision,
      reviewedAt: new Date(),
      reviewedBy: req.user._id
    };
    await target.save();

    res.json({
      success: true,
      user: target.toObject()
    });
  } catch (error) {
    console.error("Review request error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ========== UPDATE USER STATUS (Suspend/Restore) ==========
exports.updateUserStatus = async (req, res) => {
  try {
    const { suspended, reason = "" } = req.body;

    if (typeof suspended !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "A suspension status is required."
      });
    }

    const target = await User.findById(req.params.userId);
    if (!target) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    // Cannot suspend yourself
    if (target._id.equals(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own access."
      });
    }

    // Cannot suspend other admins
    if (target.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin accounts cannot be suspended here."
      });
    }

    target.isSuspended = suspended;
    target.suspendedAt = suspended ? new Date() : null;
    target.suspensionReason = suspended ? String(reason).trim().slice(0, 300) : "";
    await target.save();

    res.json({
      success: true,
      user: target.toObject(),
      message: suspended ? "Account suspended." : "Account restored."
    });
  } catch (error) {
    console.error("Update user status error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ========== UPDATE SETTINGS ==========
exports.updateSettings = async (req, res) => {
  try {
    const headerColor = String(req.body?.headerColor || "");

    if (!/^#[0-9A-Fa-f]{6}$/.test(headerColor)) {
      return res.status(400).json({
        success: false,
        message: "Use a six-digit hex colour."
      });
    }

    const settings = await AppSettings.findOneAndUpdate(
      {},
      { headerColor },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error("Update settings error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ========== SEND ANNOUNCEMENT ==========
exports.announce = async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim().slice(0, 500);

    if (message.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Announcement must be at least 3 characters."
      });
    }

    const recipients = await User.find({
      _id: { $ne: req.user._id },
      isSuspended: false
    }).select("_id").lean();

    if (recipients.length) {
      await Notification.insertMany(
        recipients.map((user) => ({
          sender: req.user._id,
          receiver: user._id,
          type: "admin_announcement",
          message: message
        }))
      );

      // Emit real-time notifications via socket
      if (global.io) {
        recipients.forEach((user) => {
          global.io.to(user._id.toString()).emit("newNotification", {
            senderName: "SafeChat Admin",
            type: "admin_announcement",
            message: message,
            createdAt: new Date()
          });
        });
      }
    }

    res.json({
      success: true,
      recipients: recipients.length,
      message: "Announcement sent."
    });
  } catch (error) {
    console.error("Announce error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};