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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "User",
  userSchema
);