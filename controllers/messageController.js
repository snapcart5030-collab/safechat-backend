const Message = require("../models/Message");
const User = require("../models/User");
const sendNotification = require("../utils/sendNotification");

const sendMessage = async (req, res) => {
  console.log("================================");
  console.log("SEND MESSAGE API CALLED");
  console.log("sender:", req.body.senderId);
  console.log("receiver:", req.body.receiverId);
  console.log("message:", req.body.message);
  console.log("================================");

  try {
    const { senderId, receiverId, message } = req.body;

    const senderUser = await User.findById(senderId);
    const receiverUserCheck = await User.findById(receiverId);

    if (!senderUser || !receiverUserCheck) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const canChat =
      senderUser.following.some((id) => id.toString() === receiverId) &&
      receiverUserCheck.followers.some((id) => id.toString() === senderId);

    if (!canChat) {
      return res.status(403).json({
        success: false,
        message: "Follow request not accepted",
      });
    }

    const newMessage = await Message.create({
      senderId,
      receiverId,
      message,
      seen: false,
      isRead: false,
      createdAt: new Date(),
      autoDeleteAt: new Date(Date.now() + 30000), // 30 seconds
    });

    const receiverUser = await User.findById(receiverId);

    if (receiverUser && receiverUser.fcmToken) {
      await sendNotification(receiverUser.fcmToken, "New Message", message);
    }

    if (global.io) {
      global.io.to(receiverId).emit("receiveMessage", newMessage);

      // Emit to update chat list for both users
      global.io.to(senderId).emit("chatListUpdated", {
        userId: senderId,
        chatWith: receiverId,
        lastMessage: message,
        lastMessageTime: new Date(),
      });

      global.io.to(receiverId).emit("chatListUpdated", {
        userId: receiverId,
        chatWith: senderId,
        lastMessage: message,
        lastMessageTime: new Date(),
      });
    }

    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getMessages = async (req, res) => {
  try {
    const { senderId, receiverId } = req.params;

    const messages = await Message.find({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const markRead = async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    const messages = await Message.find({
      senderId,
      receiverId,
      isRead: false,
    });

    for (const msg of messages) {
      msg.isRead = true;
      msg.readAt = new Date();
      await msg.save();
    }

    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// NEW: Get last message between two users
const getLastMessage = async (req, res) => {
  try {
    const { userId, chatWithId } = req.params;

    // Get the last message between these two users
    const lastMessage = await Message.findOne({
      $or: [
        { senderId: userId, receiverId: chatWithId },
        { senderId: chatWithId, receiverId: userId },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(1);

    // Count unread messages
    const unreadCount = await Message.countDocuments({
      senderId: chatWithId,
      receiverId: userId,
      isRead: false,
    });

    // Check if messages are seen
    const lastSeen = await Message.findOne({
      senderId: chatWithId,
      receiverId: userId,
    })
      .sort({ createdAt: -1 })
      .limit(1);

    res.json({
      message: lastMessage?.message || null,
      createdAt: lastMessage?.createdAt || null,
      unreadCount: unreadCount || 0,
      seen: lastSeen?.seen || false,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// NEW: Get all conversations with last messages for a user
const getAllConversations = async (req, res) => {
  try {
    const { userId } = req.params;

    // Get all users that the current user has chatted with
    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    })
      .sort({ createdAt: -1 })
      .populate('senderId', 'name email picture')
      .populate('receiverId', 'name email picture');

    // Get unique chat partners
    const chatPartners = new Map();

    messages.forEach((msg) => {
      const senderId = msg.senderId._id ? msg.senderId._id.toString() : msg.senderId.toString();
      const receiverId = msg.receiverId._id ? msg.receiverId._id.toString() : msg.receiverId.toString();

      const partnerId = senderId === userId ? receiverId : senderId;

      if (!chatPartners.has(partnerId)) {
        const partner = senderId === userId ? msg.receiverId : msg.senderId;

        chatPartners.set(partnerId, {
          _id: partner._id || partner,
          name: partner.name || "Unknown",
          email: partner.email || "",
          picture: partner.picture || null,
          lastMessage: msg.message,
          lastMessageTime: msg.createdAt,
          unreadCount: 0,
          seen: msg.seen || false,
        });
      }
    });

    // Count unread messages for each partner
    for (const [partnerId, data] of chatPartners) {
      const unreadCount = await Message.countDocuments({
        senderId: partnerId,
        receiverId: userId,
        isRead: false,
      });
      data.unreadCount = unreadCount;
    }

    res.json(Array.from(chatPartners.values()));
  } catch (error) {
    console.error("Error in getAllConversations:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};

// NEW: Update seen status for messages
const markSeen = async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    const result = await Message.updateMany(
      {
        senderId,
        receiverId,
        seen: false,
      },
      {
        $set: { seen: true },
      }
    );

    res.json({
      success: true,
      message: "Messages marked as seen",
      updatedCount: result.nModified || 0,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// NEW: Get unread message count for a user
const getUnreadCount = async (req, res) => {
  try {
    const { userId } = req.params;

    const unreadCount = await Message.countDocuments({
      receiverId: userId,
      isRead: false,
    });

    res.json({
      unreadCount: unreadCount || 0,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// NEW: Delete a message (for both users)
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId } = req.body;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Only allow deletion if user is sender or receiver
    if (message.senderId.toString() !== userId && message.receiverId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this message",
      });
    }

    await Message.findByIdAndDelete(messageId);

    // Emit deletion event
    if (global.io) {
      global.io.to(message.senderId.toString()).emit("messageDeleted", messageId);
      global.io.to(message.receiverId.toString()).emit("messageDeleted", messageId);
    }

    res.json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  markRead,
  getLastMessage,
  getAllConversations,
  markSeen,
  getUnreadCount,
  deleteMessage,
};