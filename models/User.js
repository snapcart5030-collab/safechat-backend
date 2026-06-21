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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "User",
  userSchema
);