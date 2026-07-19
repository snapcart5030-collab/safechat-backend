const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "",
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    password: {
      type: String,
      required: false, // Google Users साठी false
    },
    picture: {
      type: String,
      default: "",
    },
    googleId: {
      type: String,
      default: "",
    },
    fcmToken: {
      type: String,
      default: "",
    },
    aiUsage: {
      count: {
        type: Number,
        default: 0,
      },
      resetAt: {
        type: Date,
        default: null,
      },
    },
    language: {
      type: String,
      enum: ["en", "mr", "hi", "te"],
      default: "en",
    },
    languageSelected: {
      type: Boolean,
      default: false,
    },
    // FOLLOWERS
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    followRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    favoriteUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    blockedMessages: [
      {
        blockerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        message: {
          type: String,
          default: "",
        },
        sentAt: {
          type: Date,
          default: Date.now,
        },
        isRead: {
          type: Boolean,
          default: false,
        },
      },
    ],
    username: {
      type: String,
      index: { unique: true, sparse: true },
    },
    bio: {
      type: String,
      default: "Hey there! I am using SafeChat 👋",
    },
    phone: {
      type: String,
      default: "",
    },
    dob: {
      type: String,
      default: "",
    },
    location: {
      type: String,
      default: "",
    },
    privacySettings: {
      lastSeen: {
        type: String,
        enum: ["everyone", "followers", "nobody"],
        default: "everyone",
      },
      profilePhoto: {
        type: String,
        enum: ["everyone", "followers", "nobody"],
        default: "everyone",
      },
      status: {
        type: String,
        enum: ["everyone", "followers", "nobody"],
        default: "everyone",
      },
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    onlineStatus: {
      type: String,
      default: "Available",
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    adminRequest: {
      status: {
        type: String,
        enum: ["none", "pending", "approved", "rejected"],
        default: "none",
      },
      note: { type: String, default: "" },
      requestedAt: { type: Date, default: null },
      reviewedAt: { type: Date, default: null },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    isSuspended: { type: Boolean, default: false },
    suspendedAt: { type: Date, default: null },
    suspensionReason: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);