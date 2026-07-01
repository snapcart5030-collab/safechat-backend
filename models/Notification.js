const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: [
        "follow_request",      // When someone sends a follow request
        "follow_accepted",     // When someone accepts your follow request or mutual follow
        "request_accepted",    // When someone accepts your follow request (alias)
        "request_rejected",    // When someone rejects your follow request
        "unfollowed",          // When someone unfollows you
        "follow",              // When someone starts following you
        "profile_view",        // When someone views your profile
        "chat_seen",           // When someone sees your chat
        "message",             // When you receive a new message
        "like",                // When someone likes your post
        "comment",             // When someone comments on your post
        "mention",             // When someone mentions you
      ],
      required: true,
    },

    message: {
      type: String,
      default: "",
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
notificationSchema.index({ receiver: 1, createdAt: -1 });
notificationSchema.index({ receiver: 1, isRead: 1 });

module.exports = mongoose.model("Notification", notificationSchema);