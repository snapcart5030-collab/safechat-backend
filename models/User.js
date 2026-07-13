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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "User",
  userSchema
);