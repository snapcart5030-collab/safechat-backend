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
    const { receiverId, message, fileUrl, fileName, fileType, fileSize, replyTo, clientMessageId } = req.body;
    const senderId = req.user._id.toString();

    if (!receiverId || (!message?.trim() && !fileUrl)) {
      return res.status(400).json({ success: false, message: "A recipient and message or attachment are required" });
    }

    if (clientMessageId) {
      const existing = await Message.findOne({ senderId, clientMessageId });
      if (existing) return res.status(200).json(existing);
    }

    const senderUser = await User.findById(senderId);
    const receiverUser = await User.findById(receiverId);

    if (!senderUser || !receiverUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ========== BLOCK CHECK - Sender blocked Receiver ==========
    if (
      senderUser.blockedUsers.some(
        (id) => id.toString() === receiverId
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "You have blocked this user. Unblock to send messages.",
        blocked: true,
        blockedBy: senderId,
      });
    }

    // A block is a communication gate only.  It must never alter a follow
    // relationship or create a "waiting" message that is delivered later.
    if (
      receiverUser.blockedUsers.some(
        (id) => id.toString() === senderId
      )
    ) {
      return res.status(403).json({ success: false, message: "You cannot message this user while blocked.", blocked: true, blockedBy: receiverId });
    }

    // ========== NORMAL CHAT FLOW (Not Blocked) ==========
    const canChat =
      senderUser.following.some((id) => id.toString() === receiverId) &&
      receiverUser.followers.some((id) => id.toString() === senderId);

    if (!canChat) {
      return res.status(403).json({
        success: false,
        message: "Follow request not accepted",
      });
    }

    // Check if receiver has active sockets currently
    const isOnline = global.io?.sockets.adapter.rooms.get(receiverId)?.size > 0;

    const newMessage = await Message.create({
      senderId,
      receiverId,
      message: message || "",
      fileUrl: fileUrl || null,
      fileName: fileName || null,
      fileType: fileType || null,
      fileSize: fileSize || null,
      replyTo: replyTo || null,
      ...(clientMessageId && { clientMessageId }),
      seen: false,
      isRead: false,
      delivered: isOnline,
      createdAt: new Date(),
      autoDeleteAt: new Date(Date.now() + 30000),
      status: isOnline ? "delivered" : "sent",
    });

    if (receiverUser && receiverUser.fcmToken) {
      await sendNotification(receiverUser.fcmToken, "New Message", message || `Sent a ${fileType}`);
    }

    if (global.io) {
      global.io.to(receiverId).emit("receiveMessage", newMessage);
      global.io.to(senderId).emit("chatListUpdated", {
        userId: senderId,
        chatWith: receiverId,
        lastMessage: message || `[${fileType}]`,
        lastMessageTime: new Date(),
      });
      global.io.to(receiverId).emit("chatListUpdated", {
        userId: receiverId,
        chatWith: senderId,
        lastMessage: message || `[${fileType}]`,
        lastMessageTime: new Date(),
      });
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const getMessages = async (req, res) => {
  try {
    const { senderId, receiverId } = req.params;

    const senderUser = await User.findById(senderId);
    const receiverUser = await User.findById(receiverId);

    if (!senderUser || !receiverUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if blocked - return block info instead of error
    const isSenderBlocked = senderUser.blockedUsers.some(
      (id) => id.toString() === receiverId
    );
    const isReceiverBlocked = receiverUser.blockedUsers.some(
      (id) => id.toString() === senderId
    );

    if (isSenderBlocked || isReceiverBlocked) {
      // Check for one-time message
      const blockedBy = isSenderBlocked ? senderId : receiverId;
      const blockedUser = isSenderBlocked ? receiverId : senderId;
      
      // Find blocked message
      let blockedMessage = null;
      if (isReceiverBlocked) {
        const user = await User.findById(receiverId);
        const msg = user?.blockedMessages.find(
          (bm) => bm.blockerId.toString() === senderId
        );
        if (msg) blockedMessage = msg;
      }

      return res.status(403).json({
        success: false,
        message: isSenderBlocked ? "You have blocked this user" : "You are blocked by this user",
        blocked: true,
        blockedBy: blockedBy,
        oneTimeSent: !!blockedMessage,
        oneTimeMessage: blockedMessage?.message || null,
        oneTimeSentAt: blockedMessage?.sentAt || null,
      });
    }

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
      $or: [
        { senderId: senderId, receiverId: receiverId },
        { senderId: receiverId, receiverId: senderId }
      ],
      isRead: false,
    });

    for (const msg of messages) {
      msg.isRead = true;
      msg.readAt = new Date();
      await msg.save();
    }

    if (global.io) {
      global.io.to(senderId).emit("messagesRead", {
        by: receiverId,
        messages: messages.map(m => m._id)
      });
    }

    res.json({
      success: true,
      message: "Messages marked as read",
      readCount: messages.length
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getLastMessage = async (req, res) => {
  try {
    const { userId, chatWithId } = req.params;

    const currentUser = await User.findById(userId);
    const chatUser = await User.findById(chatWithId);

    // Check block status
    const isBlocked = currentUser.blockedUsers.some(id => id.toString() === chatWithId);
    const isBlockedBy = chatUser.blockedUsers.some(id => id.toString() === userId);

    if (isBlocked || isBlockedBy) {
      let blockedMessage = null;
      if (isBlockedBy) {
        const msg = chatUser?.blockedMessages.find(
          (bm) => bm.blockerId.toString() === userId
        );
        if (msg) blockedMessage = msg;
      }

      return res.json({
        message: blockedMessage?.message || "Blocked",
        createdAt: blockedMessage?.sentAt || null,
        unreadCount: 0,
        seen: false,
        blocked: true,
        blockedBy: isBlocked ? userId : chatWithId,
        oneTimeSent: !!blockedMessage,
      });
    }

    const lastMessage = await Message.findOne({
      $or: [
        { senderId: userId, receiverId: chatWithId },
        { senderId: chatWithId, receiverId: userId },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(1);

    const unreadCount = await Message.countDocuments({
      senderId: chatWithId,
      receiverId: userId,
      isRead: false,
    });

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
      blocked: false,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getAllConversations = async (req, res) => {
  try {
    const { userId } = req.params;

    const currentUser = await User.findById(userId);

    const blockedUsers = currentUser.blockedUsers.map((id) =>
      id.toString()
    );

    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    })
      .sort({ createdAt: -1 })
      .populate('senderId', 'name email picture')
      .populate('receiverId', 'name email picture');

    const chatPartners = new Map();

    messages.forEach((msg) => {
      const senderId = msg.senderId._id ? msg.senderId._id.toString() : msg.senderId.toString();
      const receiverId = msg.receiverId._id ? msg.receiverId._id.toString() : msg.receiverId.toString();

      const partnerId = senderId === userId ? receiverId : senderId;

      if (blockedUsers.includes(partnerId)) {
        return;
      }

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
          blocked: false,
        });
      }
    });

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

    if (message.senderId.toString() !== userId && message.receiverId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this message",
      });
    }

    await Message.findByIdAndDelete(messageId);

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

const deliverOfflineMessages = async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    const messages = await Message.find({
      senderId: senderId,
      receiverId: receiverId,
      isRead: false,
      delivered: false
    });

    const deliveredMessages = [];
    for (const msg of messages) {
      msg.delivered = true;
      await msg.save();
      deliveredMessages.push(msg);
    }

    if (global.io) {
      deliveredMessages.forEach(msg => {
        global.io.to(receiverId).emit("receiveMessage", msg);
      });
    }

    res.json({
      success: true,
      deliveredMessages: deliveredMessages,
      count: deliveredMessages.length
    });
  } catch (error) {
    console.error("Error in deliverOfflineMessages:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};

// NEW: Check block status between two users
const checkBlockStatus = async (req, res) => {
  try {
    const { userId, targetUserId } = req.params;

    const user = await User.findById(userId);
    const targetUser = await User.findById(targetUserId);

    if (!user || !targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userBlockedTarget = user.blockedUsers.some(
      (id) => id.toString() === targetUserId
    );
    const targetBlockedUser = targetUser.blockedUsers.some(
      (id) => id.toString() === userId
    );

    // Check for one-time message
    let oneTimeMessage = null;
    let oneTimeSent = false;
    if (targetBlockedUser) {
      const blockedMsg = targetUser.blockedMessages.find(
        (bm) => bm.blockerId.toString() === userId
      );
      if (blockedMsg) {
        oneTimeMessage = blockedMsg.message;
        oneTimeSent = true;
      }
    }

    res.json({
      blocked: userBlockedTarget || targetBlockedUser,
      blockedBy: userBlockedTarget ? userId : targetBlockedUser ? targetUserId : null,
      oneTimeSent: oneTimeSent,
      oneTimeMessage: oneTimeMessage,
      canChat: !(userBlockedTarget || targetBlockedUser),
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const uploadAttachment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    
    const mime = req.file.mimetype;
    let fileType = "document";
    if (mime.startsWith("image/")) {
      fileType = "image";
    } else if (mime.startsWith("video/")) {
      fileType = "video";
    } else if (mime.startsWith("audio/")) {
      fileType = "audio";
    }

    res.json({
      success: true,
      fileUrl: req.file.path,
      fileName: req.file.originalname,
      fileType,
      fileSize: req.file.size,
    });
  } catch (error) {
    console.error("Upload attachment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const reactToMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId, emoji } = req.body;

    const msg = await Message.findById(messageId);
    if (!msg) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    msg.reactions = msg.reactions.filter((r) => r.userId.toString() !== userId);

    if (emoji) {
      msg.reactions.push({ userId, emoji });
    }

    await msg.save();

    if (global.io) {
      global.io.to(msg.senderId.toString()).emit("messageReacted", { messageId, reactions: msg.reactions });
      global.io.to(msg.receiverId.toString()).emit("messageReacted", { messageId, reactions: msg.reactions });
    }

    res.json({ success: true, reactions: msg.reactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { text, userId } = req.body;

    const msg = await Message.findById(messageId);
    if (!msg) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    if (msg.senderId.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Not authorized to edit this message" });
    }

    msg.message = text;
    msg.isEdited = true;
    await msg.save();

    if (global.io) {
      global.io.to(msg.senderId.toString()).emit("messageEdited", { messageId, text, isEdited: true });
      global.io.to(msg.receiverId.toString()).emit("messageEdited", { messageId, text, isEdited: true });
    }

    res.json({ success: true, message: msg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const starMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { isStarred } = req.body;

    const msg = await Message.findByIdAndUpdate(messageId, { isStarred }, { new: true });
    if (!msg) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    res.json({ success: true, message: msg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const pinMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { isPinned } = req.body;

    const msg = await Message.findByIdAndUpdate(messageId, { isPinned }, { new: true });
    if (!msg) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    res.json({ success: true, message: msg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSharedMedia = async (req, res) => {
  try {
    const { userId, chatWithId } = req.params;

    const mediaMessages = await Message.find({
      $or: [
        { senderId: userId, receiverId: chatWithId },
        { senderId: chatWithId, receiverId: userId },
      ],
      fileUrl: { $ne: null },
    }).sort({ createdAt: -1 });

    res.json(mediaMessages);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
  deliverOfflineMessages,
  checkBlockStatus,
  uploadAttachment,
  reactToMessage,
  editMessage,
  starMessage,
  pinMessage,
  getSharedMedia,
};
