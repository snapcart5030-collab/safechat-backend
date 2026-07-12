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
      default: "",
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
    status: {
      type: String,
      enum: ["sent", "delivered", "read", "blocked_waiting"],
      default: "sent",
    },
    clientMessageId: {
      type: String,
    },
    // ATTACHMENT SHARING
    fileUrl: {
      type: String,
      default: null,
    },
    fileName: {
      type: String,
      default: null,
    },
    fileType: {
      type: String,
      enum: ["image", "video", "audio", "document", null],
      default: null,
    },
    fileSize: {
      type: Number,
      default: null,
    },
    // REACTIONS & REPLIES
    reactions: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        emoji: {
          type: String,
        },
      },
    ],
    replyTo: {
      messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
      text: {
        type: String,
      },
      senderName: {
        type: String,
      },
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isStarred: {
      type: Boolean,
      default: false,
    },
    deletedForUsers: [
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

// Index for faster queries
messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ receiverId: 1, isRead: 1 });
messageSchema.index({ autoDeleteAt: 1 });
messageSchema.index({ status: 1 });
messageSchema.index(
  { senderId: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientMessageId: { $exists: true, $type: "string" }
    }
  }
);
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
