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

    // ========== BLOCK CHECK - Receiver blocked Sender ==========
    if (
      receiverUser.blockedUsers.some(
        (id) => id.toString() === senderId
      )
    ) {
      // Check if this user already sent a one-time message
      const existingBlockedMessage = receiverUser.blockedMessages.find(
        (bm) => bm.blockerId.toString() === senderId
      );

      // If one-time message already sent
      if (existingBlockedMessage) {
        return res.status(403).json({
          success: false,
          message: "You are blocked. You already sent your one-time message.",
          blocked: true,
          blockedBy: receiverId,
          oneTimeSent: true,
          oneTimeMessage: existingBlockedMessage.message,
        });
      }

      // Allow ONE message (first time)
      const newMessage = await Message.create({
        senderId,
        receiverId,
        message,
        seen: false,
        isRead: false,
        delivered: false,
        createdAt: new Date(),
        autoDeleteAt: new Date(Date.now() + 30000),
        status: "blocked_waiting",
      });

      // Save the one-time message in receiver's blockedMessages array
      receiverUser.blockedMessages.push({
        blockerId: senderId,
        message: message,
        sentAt: new Date(),
        isRead: false,
      });
      await receiverUser.save();

      // Send notification to receiver (blocker) about the message
      if (receiverUser && receiverUser.fcmToken) {
        await sendNotification(
          receiverUser.fcmToken,
          "Blocked User Messaged You",
          `${senderUser.name} sent a message while blocked: ${message.substring(0, 50)}...`
        );
      }

      // Socket events
      if (global.io) {
        // Send to receiver (blocker) - they get the message
        global.io.to(receiverId).emit("receiveMessage", newMessage);
        
        // Send to sender (blocked) - they see "waiting" status
        global.io.to(senderId).emit("receiveMessage", newMessage);
        
        // Notify receiver that blocked user sent a message
        global.io.to(receiverId).emit("blockedUserMessaged", {
          from: senderId,
          fromName: senderUser.name,
          message: message,
          timestamp: new Date(),
          oneTime: true,
        });

        // Notify sender that message is waiting
        global.io.to(senderId).emit("messageWaitingForUnblock", {
          to: receiverId,
          message: message,
          timestamp: new Date(),
          status: "waiting_for_unblock",
        });

        // Chat list updates
        global.io.to(senderId).emit("chatListUpdated", {
          userId: senderId,
          chatWith: receiverId,
          lastMessage: message,
          lastMessageTime: new Date(),
          blocked: true,
          status: "waiting_for_unblock",
        });

        global.io.to(receiverId).emit("chatListUpdated", {
          userId: receiverId,
          chatWith: senderId,
          lastMessage: message,
          lastMessageTime: new Date(),
          blocked: true,
          fromBlockedUser: true,
        });
      }

      return res.status(201).json({
        success: true,
        message: "Message sent (waiting for unblock)",
        status: "blocked_waiting",
        oneTimeSent: true,
        data: newMessage,
      });
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

    const newMessage = await Message.create({
      senderId,
      receiverId,
      message,
      seen: false,
      isRead: false,
      delivered: false,
      createdAt: new Date(),
      autoDeleteAt: new Date(Date.now() + 30000),
      status: "sent",
    });

    if (receiverUser && receiverUser.fcmToken) {
      await sendNotification(receiverUser.fcmToken, "New Message", message);
    }

    if (global.io) {
      global.io.to(receiverId).emit("receiveMessage", newMessage);
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
};