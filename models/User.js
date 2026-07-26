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

    // FOLLOWING
    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // PENDING REQUESTS
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

    maintenanceBlocked: {
    type: Boolean,
    default: false,
},
maintenanceBypass: {
    type: Boolean,
    default: false,
},
    // NEW: Track one-time messages from blocked users
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

    // WHATSAPP-STYLE EXTRA FIELDS
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
    // Admin access is deliberately approval-based. New users can request it,
    // but only an existing admin (or the configured bootstrap email) can grant it.
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

module.exports = mongoose.model(
  "User",
  userSchema
);
