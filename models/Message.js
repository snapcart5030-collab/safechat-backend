const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    seen: {
      type: Boolean,
      default: false,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    delivered: {
      type: Boolean,
      default: false,
    },
    autoDeleteAt: {
      type: Date,
      default: null,
    },
    // NEW: Track message status for blocked users
    status: {
      type: String,
      enum: ["sent", "delivered", "read", "blocked_waiting"],
      default: "sent",
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ receiverId: 1, isRead: 1 });
messageSchema.index({ autoDeleteAt: 1 });
messageSchema.index({ status: 1 });

module.exports = mongoose.model("Message", messageSchema);