// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

console.log("Firebase Admin Connected Successfully");

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const aiRoutes = require("./routes/aiRoutes");
const fcmRoutes = require("./routes/fcmRoutes");
const followRoutes = require("./routes/followRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const chatCustomizationRoutes = require('./routes/chatCustomizationRoutes');
const Message = require("./models/Message");
const User = require("./models/User");
const liveLocationRoutes = require("./routes/liveLocationRoutes");
const CallHistory = require("./models/CallHistory");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN?.split(",") || "*",
    methods: ["GET", "POST"],
  },
});

global.io = io;

// Socket events are authorization-sensitive (messages, calls and location).
// Bind a connection to its JWT once, never to a client supplied user id.
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("unauthorized"));
    socket.userId = jwt.verify(token, process.env.JWT_SECRET).id.toString();
    return next();
  } catch (_) {
    return next(new Error("unauthorized"));
  }
});

// AUTO DELETE READ MESSAGES AFTER 30 SECONDS
setInterval(async () => {
  try {
    const now = new Date();

    const messages = await Message.find({
      autoDeleteAt: {
        $ne: null,
        $lte: now,
      },
    });

    for (const msg of messages) {
      io.to(msg.senderId.toString()).emit("messageDeleted", msg._id);
      io.to(msg.receiverId.toString()).emit("messageDeleted", msg._id);
      await Message.findByIdAndDelete(msg._id);
      console.log("Deleted Message:", msg._id);
    }
  } catch (err) {
    console.log("Auto Delete Error:", err.message);
  }
}, 1000);

// Database Connection
connectDB();

// Middleware
app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/fcm", fcmRoutes);
app.use("/api/follow", followRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/uploads", express.static("uploads"));
app.use('/api/chat-customization', chatCustomizationRoutes);
app.use("/api/location", liveLocationRoutes);

// ================= ONLINE USERS TRACKING =================
const onlineUsers = new Map(); // Store userId -> Set of socketIds
const userSocketMap = new Map(); // Store socketId -> userId for quick lookup
const activeVoiceCalls = new Map(); // Store active calls
const activeVideoCalls = new Map(); // Store active video calls
const activeLocationSharing = new Map();
const { resolvePeerSocketId } = require("./utils/socketRouting");

// Helper function to get socket ID from user ID
const getSocketIdFromUserId = (userId) => {
  const userSockets = onlineUsers.get(userId);
  if (userSockets && userSockets.size > 0) {
    return [...userSockets][0];
  }
  return null;
};

// ================= SOCKET.IO =================
io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);
  const authenticatedUserId = socket.userId;
  socket.join(authenticatedUserId);
  userSocketMap.set(socket.id, authenticatedUserId);
  if (!onlineUsers.has(authenticatedUserId)) onlineUsers.set(authenticatedUserId, new Set());
  onlineUsers.get(authenticatedUserId).add(socket.id);
  io.emit("userOnline", authenticatedUserId);

  // ========== BLOCK/UNBLOCK SOCKET EVENTS ==========

  // User blocks someone
  socket.on("blockUser", (data) => {
    const { blockerId, blockedId, blockerName, blockedName } = data;

    console.log(`🔒 ${blockerName} blocked ${blockedName}`);

    io.to(blockedId).emit("userBlocked", {
      by: blockerId,
      byName: blockerName,
      message: `${blockerName} has blocked you`,
      blocked: true,
      timestamp: new Date(),
    });

    io.to(blockerId).emit("userBlockedSuccess", {
      blockedUser: blockedId,
      blockedName: blockedName,
      timestamp: new Date(),
    });

    io.to(blockedId).emit("chatListUpdated", {
      userId: blockedId,
      chatWith: blockerId,
      blocked: true,
      blockedBy: blockerId,
      lastMessage: `${blockerName} has blocked you`,
      lastMessageTime: new Date(),
    });

    io.to(blockerId).emit("chatListUpdated", {
      userId: blockerId,
      chatWith: blockedId,
      blocked: true,
      blockedBy: blockerId,
      lastMessage: `You blocked ${blockedName}`,
      lastMessageTime: new Date(),
    });
  });

  // User unblocks someone - RESTORES connection and chat
  socket.on("unblockUser", async (data) => {
    const { unblockerId, unblockedId, unblockerName, unblockedName } = data;

    console.log(`🔓 ${unblockerName} unblocked ${unblockedName}`);

    try {
      const User = require("../models/User");
      const unblocker = await User.findById(unblockerId);
      const unblocked = await User.findById(unblockedId);

      const wasConnected = unblocker.previousConnections &&
        unblocker.previousConnections.some(id => id.toString() === unblockedId);

      // Emit to unblocked user
      io.to(unblockedId).emit("userUnblocked", {
        by: unblockerId,
        byName: unblockerName,
        message: wasConnected
          ? `${unblockerName} has unblocked you. Your connection has been restored!`
          : `${unblockerName} has unblocked you. You can chat again!`,
        unblocked: true,
        connectionRestored: wasConnected,
        timestamp: new Date(),
      });

      // Emit to unblocker
      io.to(unblockerId).emit("userUnblockedSuccess", {
        unblockedUser: unblockedId,
        unblockedName: unblockedName,
        connectionRestored: wasConnected,
        timestamp: new Date(),
      });

      // Emit chat list updates
      io.to(unblockedId).emit("chatListUpdated", {
        userId: unblockedId,
        chatWith: unblockerId,
        blocked: false,
        unblocked: true,
        connectionRestored: wasConnected,
        lastMessage: wasConnected
          ? `${unblockerName} has unblocked you. Your connection has been restored!`
          : `${unblockerName} has unblocked you. You can chat now!`,
        lastMessageTime: new Date(),
      });

      io.to(unblockerId).emit("chatListUpdated", {
        userId: unblockerId,
        chatWith: unblockedId,
        blocked: false,
        unblocked: true,
        connectionRestored: wasConnected,
        lastMessage: wasConnected
          ? `You unblocked ${unblockedName}. Your connection has been restored!`
          : `You unblocked ${unblockedName}. You can chat now!`,
        lastMessageTime: new Date(),
      });

      // Emit chat restored events
      io.to(unblockerId).emit("chatRestored", {
        with: unblockedId,
        name: unblockedName,
        connectionRestored: wasConnected,
      });

      io.to(unblockedId).emit("chatRestored", {
        with: unblockerId,
        name: unblockerName,
        connectionRestored: wasConnected,
      });

      // If connection was restored, emit follow restored event
      if (wasConnected) {
        io.to(unblockerId).emit("followRestored", {
          with: unblockedId,
          name: unblockedName,
          message: `Your connection with ${unblockedName} has been restored!`,
        });

        io.to(unblockedId).emit("followRestored", {
          with: unblockerId,
          name: unblockerName,
          message: `Your connection with ${unblockerName} has been restored!`,
        });
      }

    } catch (error) {
      console.error("Error in unblock socket event:", error);

      // Fallback: still emit basic unblock events
      io.to(unblockedId).emit("userUnblocked", {
        by: unblockerId,
        byName: unblockerName,
        message: `${unblockerName} has unblocked you. You can chat again!`,
        unblocked: true,
        timestamp: new Date(),
      });

      io.to(unblockerId).emit("userUnblockedSuccess", {
        unblockedUser: unblockedId,
        unblockedName: unblockedName,
        timestamp: new Date(),
      });
    }
  });

  // Blocked user sends one-time message
  socket.on("blockedUserMessage", (data) => {
    const { senderId, receiverId, message, senderName } = data;

    console.log(`📨 Blocked user ${senderName} sent one-time message to ${receiverId}`);

    io.to(receiverId).emit("blockedUserMessaged", {
      from: senderId,
      fromName: senderName,
      message: message,
      timestamp: new Date(),
      oneTime: true,
    });

    io.to(senderId).emit("messageWaitingForUnblock", {
      to: receiverId,
      message: message,
      timestamp: new Date(),
      status: "waiting_for_unblock",
    });
  });

  // Check block status
  socket.on("checkBlockStatus", async (data) => {
    const { userId, targetUserId } = data;

    try {
      const user = await User.findById(userId);
      const targetUser = await User.findById(targetUserId);

      const isBlocked = user.blockedUsers.some(id => id.toString() === targetUserId);
      const isBlockedBy = targetUser.blockedUsers.some(id => id.toString() === userId);

      let oneTimeMessage = null;
      let oneTimeSent = false;
      if (isBlockedBy) {
        const blockedMsg = targetUser.blockedMessages.find(
          (bm) => bm.blockerId.toString() === userId
        );
        if (blockedMsg) {
          oneTimeMessage = blockedMsg.message;
          oneTimeSent = true;
        }
      }

      io.to(userId).emit("blockStatusResponse", {
        userId: userId,
        targetUserId: targetUserId,
        blocked: isBlocked || isBlockedBy,
        blockedBy: isBlocked ? userId : isBlockedBy ? targetUserId : null,
        oneTimeSent: oneTimeSent,
        oneTimeMessage: oneTimeMessage,
        canChat: !(isBlocked || isBlockedBy),
      });
    } catch (error) {
      console.error("Check block status error:", error);
    }
  });

  socket.on("join", async () => {
    const userId = authenticatedUserId;
    socket.join(userId);
    socket.userId = userId;

    // Store socket to user mapping
    userSocketMap.set(socket.id, userId);

    console.log(`✅ User Joined Room: ${userId}`);

    // SYNCHRONIZATION: Mark all offline messages as delivered
    try {
      const Message = require("./models/Message");
      const offlineMessages = await Message.find({
        receiverId: userId,
        delivered: false
      });

      if (offlineMessages.length > 0) {
        const messageIds = offlineMessages.map(m => m._id);
        await Message.updateMany(
          { _id: { $in: messageIds } },
          { $set: { delivered: true, status: "delivered" } }
        );

        // Notify senders that their messages were delivered
        offlineMessages.forEach(msg => {
          io.to(msg.senderId.toString()).emit("messageDelivered", {
            messageId: msg._id,
            deliveredAt: new Date()
          });
          socket.emit("receiveMessage", {
            ...msg.toObject(),
            delivered: true,
            status: "delivered"
          });
        });
        console.log(`📡 Synced ${offlineMessages.length} offline messages as delivered for user ${userId}`);
      }
    } catch (err) {
      console.error("Sync offline messages error:", err);
    }
  });

  // Follow Accepted
  socket.on("acceptFollowRequest", (data) => {
    io.to(data.requesterId).emit("followAccepted", {
      currentUserId: data.currentUserId,
    });
  });

  socket.on("profileViewed", (data) => {
    if (data.viewerId === data.profileOwnerId) return;

    io.to(data.profileOwnerId).emit("newNotification", {
      sender: {
        _id: data.viewerId,
        name: data.viewerName,
        picture: data.viewerPicture || "",
      },
      senderName: data.viewerName,
      message: `${data.viewerName} viewed your profile`,
      type: "profile_view",
      createdAt: new Date(),
    });
  });

  // NEW: User seen chat notification
  socket.on("userSeenChat", (data) => {
    if (data.viewerId === data.profileOwnerId) return;

    io.to(data.profileOwnerId).emit("newNotification", {
      sender: {
        _id: data.viewerId,
        name: data.viewerName,
        picture: data.viewerPicture || "",
      },
      senderName: data.viewerName,
      message: `${data.viewerName} seen your chat`,
      type: "chat_seen",
      createdAt: new Date(),
    });
  });

  // Typing Start
  socket.on("typing", (data) => {
    console.log("Typing Event:", data);
    io.to(data.receiverId).emit("showTyping", {
      senderId: data.senderId,
    });
  });

  // Typing Stop
  socket.on("stopTyping", (data) => {
    console.log("Stop Typing Event:", data);
    io.to(data.receiverId).emit("hideTyping");
  });

  // ========== VOICE CALL SIGNALING ==========
  console.log("🎙️ Setting up voice call listeners for socket:", socket.id);

  // Handle voice call request - User A calls User B
  socket.on("voice-call-request", async (data) => {
    const { callId, callerId, receiverId, callerName, receiverName } = data;

    if (!callId || callerId !== authenticatedUserId || !receiverId || callerId === receiverId) return;
        

  try {
    await CallHistory.create({
      callId,
      callerId,
      receiverId,
      callType: "voice",
      status: "calling",
      startedAt: new Date(),
    });

    console.log("📞 Voice call history created");
  } catch (err) {
    console.log("Call History Error:", err.message);
  }

  
    console.log(`📞 Voice call request from ${callerName} (${callerId}) to ${receiverName} (${receiverId})`);

    const receiverSockets = onlineUsers.get(receiverId);

    if (!receiverSockets || receiverSockets.size === 0) {
      console.log(`❌ User ${receiverId} is offline`);
      socket.emit("voice-call-user-offline", {
        receiverId,
        message: "User is offline",
      });
      return;
    }

    const receiverSocketId = [...receiverSockets][0];
    const call = {
      callerId,
      receiverId,
      callerName,
      receiverName,
      callerSocketId: socket.id,
      receiverSocketId,
      status: "calling",
      startTime: new Date(),
    };

    activeVoiceCalls.set(callId, call);

    setTimeout(() => {
      const currentCall = activeVoiceCalls.get(callId);
      if (!currentCall) return;
      if (currentCall.status === "calling") {
        io.to(currentCall.callerSocketId).emit("voice-call-rejected", {
          callId,
          message: "No Answer"
        });
        io.to(currentCall.receiverSocketId).emit("voice-call-ended-by-other", {
          callId
        });
        activeVoiceCalls.delete(callId);
        console.log("⏰ Call timeout");
      }
    }, 30000);

    io.to(receiverSocketId).emit("incoming-voice-call", {
      callId,
      callerId,
      receiverId,
      callerName,
      receiverName,
      callerSocketId: socket.id,
      receiverSocketId,
    });

    console.log(`✅ Incoming call sent to ${receiverName} (${receiverSocketId})`);
  });

  // Handle accept voice call - User B accepts call from User A
  socket.on("accept-voice-call", (data) => {
    const { callId, callerId, receiverId, callerSocketId } = data;

    console.log(`✅ Voice call accepted: ${callId} by ${receiverId}`);

    const call = activeVoiceCalls.get(callId);
    if (!call || call.receiverId !== authenticatedUserId) return;
    if (call) {
      call.status = "connected";
      call.receiverSocketId = socket.id;
      activeVoiceCalls.set(callId, call);
    }

    const targetSocketId = callerSocketId || (call?.callerSocketId ?? null);
    if (targetSocketId) {
      io.to(targetSocketId).emit("voice-call-accepted", {
        callId,
        callerId,
        receiverId,
        receiverSocketId: socket.id,
      });
    }

    console.log(`✅ Call accepted notification sent to caller (${targetSocketId})`);
  });

  // Handle reject voice call - User B rejects call from User A
  socket.on("reject-voice-call", (data) => {
    const { callId, callerId, receiverId, callerSocketId } = data;

    console.log(`❌ Voice call rejected: ${callId} by ${receiverId}`);

    activeVoiceCalls.delete(callId);

    const targetSocketId = callerSocketId || null;
    if (targetSocketId) {
      io.to(targetSocketId).emit("voice-call-rejected", {
        callId,
        callerId,
        receiverId,
        message: "Call rejected",
      });
    }

    console.log(`❌ Call rejection sent to caller (${targetSocketId})`);
  });

  // Handle WebRTC offer - Caller sends offer to Receiver
  socket.on("voice-call-offer", (data) => {
    const { offer, targetSocketId, callId, callerId, receiverId } = data;

    console.log(`📡 Sending WebRTC offer for call: ${callId} to targetSocket: ${targetSocketId}`);
    const call = activeVoiceCalls.get(callId);

    if (!call || call.callerId !== authenticatedUserId) return;

    const targetId = resolvePeerSocketId({
      socketId: socket.id,
      call,
      fallbackSocketId: targetSocketId,
    });

    if (!targetId) {
      console.error(`❌ No target socket found for call ${callId}`);
      socket.emit("voice-call-error", {
        callId,
        message: "Target socket not found",
      });
      return;
    }

    io.to(targetId).emit("voice-call-offer", {
      offer,
      callId,
      callerId,
      receiverId,
      fromSocketId: socket.id,
    });

    console.log(`✅ Offer sent to socket: ${targetId}`);
  });

  // Handle WebRTC answer - Receiver sends answer to Caller
  socket.on("voice-call-answer", (data) => {
    const { answer, targetSocketId, callId, callerId, receiverId } = data;

    console.log(`📡 Sending WebRTC answer for call: ${callId} to targetSocket: ${targetSocketId}`);
    const call = activeVoiceCalls.get(callId);

    if (!call || call.receiverId !== authenticatedUserId) return;

    const targetId = resolvePeerSocketId({
      socketId: socket.id,
      call,
      fallbackSocketId: targetSocketId,
    });

    if (!targetId) {
      console.error(`❌ No target socket found for call ${callId}`);
      socket.emit("voice-call-error", {
        callId,
        message: "Target socket not found",
      });
      return;
    }

    io.to(targetId).emit("voice-call-answer", {
      answer,
      callId,
      callerId,
      receiverId,
      fromSocketId: socket.id,
    });

    console.log(`✅ Answer sent to socket: ${targetId}`);
  });

  // Handle ICE candidates with improved error handling
  socket.on("voice-ice-candidate", (data) => {
    const { candidate, targetSocketId, callId, callerId, receiverId } = data;

    console.log(`🧊 Sending ICE candidate for call: ${callId} to targetSocket: ${targetSocketId}`);
    const call = activeVoiceCalls.get(callId);

    if (!call || ![call.callerId, call.receiverId].includes(authenticatedUserId)) return;

    const targetId = resolvePeerSocketId({
      socketId: socket.id,
      call,
      fallbackSocketId: targetSocketId,
    });

    if (!targetId) {
      console.error(`❌ No target socket found for ICE candidate ${callId}`);
      return;
    }

    io.to(targetId).emit("voice-ice-candidate", {
      candidate,
      callId,
      callerId,
      receiverId,
      fromSocketId: socket.id,
    });

    console.log(`✅ ICE candidate sent to socket: ${targetId}`);
  });

  // Handle call end with proper cleanup
  socket.on("voice-call-ended", (data) => {
    const { callId, callerId, receiverId } = data;

    console.log(`📞 Voice call ended: ${callId}`);

    const call = activeVoiceCalls.get(callId);
    if (call) {
      const peers = [call.callerSocketId, call.receiverSocketId].filter(Boolean);
      peers.forEach((peerSocketId) => {
        if (peerSocketId !== socket.id) {
          io.to(peerSocketId).emit("voice-call-ended-by-other", {
            callId,
            endedBy: socket.userId || "unknown",
          });
        }
      });
      activeVoiceCalls.delete(callId);
      console.log(`🧹 Call ${callId} cleaned up`);
    } else {
      if (callerId) {
        io.to(callerId).emit("voice-call-ended-by-other", {
          callId,
          endedBy: socket.userId || "unknown",
        });
      }
      if (receiverId) {
        io.to(receiverId).emit("voice-call-ended-by-other", {
          callId,
          endedBy: socket.userId || "unknown",
        });
      }
    }
  });

  // Handle call busy
  socket.on("voice-call-busy", (data) => {
    const { callId, callerId, receiverId } = data;
    console.log(`🔴 Voice call busy: ${callId}`);

    // Notify caller that receiver is busy
    io.to(callerId).emit("voice-call-busy", {
      callId,
      callerId,
      receiverId,
      message: "User is busy"
    });

    // Clean up
    activeVoiceCalls.delete(callId);
  });

  // ========== VIDEO CALL SIGNALING ==========
  console.log("📹 Setting up video call listeners for socket:", socket.id);

  // Handle video call request - User A calls User B
  socket.on("video-call-request", (data) => {
    const { callId, callerId, receiverId, callerName, receiverName } = data;

    if (!callId || callerId !== authenticatedUserId || !receiverId || callerId === receiverId) return;

    console.log(`📹 Video call request from ${callerName} (${callerId}) to ${receiverName} (${receiverId})`);

    const receiverSockets = onlineUsers.get(receiverId);

    if (!receiverSockets || receiverSockets.size === 0) {
      console.log(`❌ User ${receiverId} is offline`);
      socket.emit("video-call-user-offline", {
        receiverId,
        message: "User is offline",
      });
      return;
    }

    const receiverSocketId = [...receiverSockets][0];
    const call = {
      callerId,
      receiverId,
      callerName,
      receiverName,
      callerSocketId: socket.id,
      receiverSocketId,
      status: "calling",
      startTime: new Date(),
    };

    activeVideoCalls.set(callId, call);

    // Set timeout for unanswered call
    setTimeout(() => {
      const currentCall = activeVideoCalls.get(callId);
      if (!currentCall) return;
      if (currentCall.status === "calling") {
        io.to(currentCall.callerSocketId).emit("video-call-rejected", {
          callId,
          message: "No Answer"
        });
        io.to(currentCall.receiverSocketId).emit("video-call-ended-by-other", {
          callId
        });
        activeVideoCalls.delete(callId);
        console.log("⏰ Video call timeout");
      }
    }, 30000);

    io.to(receiverSocketId).emit("incoming-video-call", {
      callId,
      callerId,
      receiverId,
      callerName,
      receiverName,
      callerSocketId: socket.id,
      receiverSocketId,
    });

    console.log(`✅ Incoming video call sent to ${receiverName} (${receiverSocketId})`);
  });

  // Handle accept video call - User B accepts call from User A
  socket.on("accept-video-call", (data) => {
    const { callId, callerId, receiverId, callerSocketId } = data;

    console.log(`✅ Video call accepted: ${callId} by ${receiverId}`);

    const call = activeVideoCalls.get(callId);
    if (!call || call.receiverId !== authenticatedUserId) return;
    if (call) {
      call.status = "connected";
      call.receiverSocketId = socket.id;
      activeVideoCalls.set(callId, call);
    }

    const targetSocketId = callerSocketId || (call?.callerSocketId ?? null);
    if (targetSocketId) {
      io.to(targetSocketId).emit("video-call-accepted", {
        callId,
        callerId,
        receiverId,
        receiverSocketId: socket.id,
      });
    }

    console.log(`✅ Video call accepted notification sent to caller (${targetSocketId})`);
  });

  // Handle reject video call - User B rejects call from User A
  socket.on("reject-video-call", (data) => {
    const { callId, callerId, receiverId, callerSocketId } = data;

    console.log(`❌ Video call rejected: ${callId} by ${receiverId}`);

    activeVideoCalls.delete(callId);

    const targetSocketId = callerSocketId || null;
    if (targetSocketId) {
      io.to(targetSocketId).emit("video-call-rejected", {
        callId,
        callerId,
        receiverId,
        message: "Call rejected",
      });
    }

    console.log(`❌ Video call rejection sent to caller (${targetSocketId})`);
  });

  // Handle WebRTC offer - Caller sends offer to Receiver
  socket.on("video-call-offer", (data) => {
    const { offer, targetSocketId, callId, callerId, receiverId } = data;

    console.log(`📡 Sending WebRTC video offer for call: ${callId} to targetSocket: ${targetSocketId}`);
    const call = activeVideoCalls.get(callId);

    if (!call || call.callerId !== authenticatedUserId) {
      console.error(`❌ Call not found or not authorized for offer ${callId}`);
      return;
    }

    const targetId = resolvePeerSocketId({
      socketId: socket.id,
      call,
      fallbackSocketId: targetSocketId,
    });

    if (!targetId) {
      console.error(`❌ No target socket found for video call ${callId}`);
      socket.emit("video-call-error", {
        callId,
        message: "Target socket not found",
      });
      return;
    }

    io.to(targetId).emit("video-call-offer", {
      offer,
      callId,
      callerId,
      receiverId,
      fromSocketId: socket.id,
    });

    console.log(`✅ Video offer sent to socket: ${targetId}`);
  });

  // Handle WebRTC answer - Receiver sends answer to Caller
  socket.on("video-call-answer", (data) => {
    const { answer, targetSocketId, callId, callerId, receiverId } = data;

    console.log(`📡 Sending WebRTC video answer for call: ${callId} to targetSocket: ${targetSocketId}`);
    const call = activeVideoCalls.get(callId);

    if (!call || call.receiverId !== authenticatedUserId) {
      console.error(`❌ Call not found or not authorized for answer ${callId}`);
      return;
    }

    const targetId = resolvePeerSocketId({
      socketId: socket.id,
      call,
      fallbackSocketId: targetSocketId,
    });

    if (!targetId) {
      console.error(`❌ No target socket found for video call ${callId}`);
      socket.emit("video-call-error", {
        callId,
        message: "Target socket not found",
      });
      return;
    }

    io.to(targetId).emit("video-call-answer", {
      answer,
      callId,
      callerId,
      receiverId,
      fromSocketId: socket.id,
    });

    console.log(`✅ Video answer sent to socket: ${targetId}`);
  });

  // Handle ICE candidates for video
  socket.on("video-ice-candidate", (data) => {
    const { candidate, targetSocketId, callId, callerId, receiverId } = data;

    console.log(`🧊 Sending video ICE candidate for call: ${callId} to targetSocket: ${targetSocketId}`);
    const call = activeVideoCalls.get(callId);

    if (!call || ![call.callerId, call.receiverId].includes(authenticatedUserId)) {
      console.error(`❌ Call not found or not authorized for ICE candidate ${callId}`);
      return;
    }

    const targetId = resolvePeerSocketId({
      socketId: socket.id,
      call,
      fallbackSocketId: targetSocketId,
    });

    if (!targetId) {
      console.error(`❌ No target socket found for video ICE candidate ${callId}`);
      return;
    }

    io.to(targetId).emit("video-ice-candidate", {
      candidate,
      callId,
      callerId,
      receiverId,
      fromSocketId: socket.id,
    });

    console.log(`✅ Video ICE candidate sent to socket: ${targetId}`);
  });

  // Handle video call end with proper cleanup
  socket.on("video-call-ended", (data) => {
    const { callId, callerId, receiverId } = data;

    console.log(`📹 Video call ended: ${callId}`);

    const call = activeVideoCalls.get(callId);
    if (call) {
      const peers = [call.callerSocketId, call.receiverSocketId].filter(Boolean);
      peers.forEach((peerSocketId) => {
        if (peerSocketId !== socket.id) {
          io.to(peerSocketId).emit("video-call-ended-by-other", {
            callId,
            endedBy: socket.userId || "unknown",
          });
        }
      });
      activeVideoCalls.delete(callId);
      console.log(`🧹 Video call ${callId} cleaned up`);
    } else {
      if (callerId) {
        io.to(callerId).emit("video-call-ended-by-other", {
          callId,
          endedBy: socket.userId || "unknown",
        });
      }
      if (receiverId) {
        io.to(receiverId).emit("video-call-ended-by-other", {
          callId,
          endedBy: socket.userId || "unknown",
        });
      }
    }
  });

  // Handle video call busy
  socket.on("video-call-busy", (data) => {
    const { callId, callerId, receiverId } = data;
    console.log(`🔴 Video call busy: ${callId}`);

    // Notify caller that receiver is busy
    io.to(callerId).emit("video-call-busy", {
      callId,
      callerId,
      receiverId,
      message: "User is busy"
    });

    // Clean up
    activeVideoCalls.delete(callId);
  });

  // ================= LOCATION SHARING =================
  socket.on("join-location-room", ({ requestId }) => {
    console.log("📍 Joined Location Room:", requestId);
    socket.join(requestId);
  });

  socket.on("share-location-request", (data) => {
    io.to(data.receiverId).emit(
      "incoming-location-request",
      data
    );
  });

  // Accept
  socket.on("accept-location", (data) => {
    activeLocationSharing.set(data.shareId, {
      senderId: data.senderId,
      receiverId: data.receiverId,
      startedAt: new Date()
    });

    io.to(data.senderId).emit(
      "location-accepted",
      data
    );
  });

  // Reject
  socket.on("reject-location", (data) => {
    io.to(data.senderId).emit(
      "location-rejected",
      data
    );
  });

  socket.on("location-update", (data) => {
    if (!data?.requestId) return;

    activeLocationSharing.set(data.requestId, {
      senderId: data.userId,
      receiverId: data.receiverId,
      startedAt: new Date(),
    });

    io.to(data.requestId).emit("receive-location", {
      ...data,
      userId: data.userId,
      timestamp: Date.now(),
    });
  });

  // Stop Sharing
  socket.on("stop-location-sharing", (data) => {
    if (!data?.requestId) return;

    activeLocationSharing.delete(data.requestId);
    io.to(data.requestId).emit("location-sharing-stopped", {
      ...data,
      userId: data.userId,
      timestamp: Date.now(),
    });
  });

  // ========== DISCONNECT HANDLING ==========
  socket.on("disconnect", () => {
    console.log("❌ User Disconnected:", socket.id);

    const userId = userSocketMap.get(socket.id);
    if (userId) {
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit("userOffline", userId);
          console.log(`📴 User ${userId} is offline`);
        }
      }
      userSocketMap.delete(socket.id);
    }

    // Clean up any active calls for this socket
    for (const [callId, call] of activeVoiceCalls) {
      if (call.callerSocketId === socket.id || call.receiverSocketId === socket.id) {
        const otherSocketId = call.callerSocketId === socket.id ? call.receiverSocketId : call.callerSocketId;
        if (otherSocketId) {
          io.to(otherSocketId).emit("voice-call-ended-by-other", {
            callId,
            endedBy: userId || "unknown"
          });
        }
        activeVoiceCalls.delete(callId);
        console.log(`🧹 Cleaned up voice call ${callId} due to disconnect`);
      }
    }

    // Clean up any active video calls for this socket
    for (const [callId, call] of activeVideoCalls) {
      if (call.callerSocketId === socket.id || call.receiverSocketId === socket.id) {
        const otherSocketId = call.callerSocketId === socket.id ? call.receiverSocketId : call.callerSocketId;
        if (otherSocketId) {
          io.to(otherSocketId).emit("video-call-ended-by-other", {
            callId,
            endedBy: userId || "unknown"
          });
        }
        activeVideoCalls.delete(callId);
        console.log(`🧹 Cleaned up video call ${callId} due to disconnect`);
      }
    }

    console.log(
      `📊 Online Users (${onlineUsers.size}):`,
      Array.from(onlineUsers.keys())
    );
  });

});

// =============================================

// ================= ONLINE STATUS API ENDPOINTS =================
// Check if a single user is online
app.get("/api/users/:id/status", (req, res) => {
  const userId = req.params.id;
  const isOnline = onlineUsers.has(userId);
  res.json({
    userId,
    online: isOnline,
    timestamp: new Date().toISOString()
  });
});

// Check multiple users status
app.post("/api/users/status", (req, res) => {
  const { userIds } = req.body;
  const statuses = {};

  if (userIds && Array.isArray(userIds)) {
    userIds.forEach(id => {
      statuses[id] = onlineUsers.has(id);
    });
  }

  res.json({
    statuses,
    timestamp: new Date().toISOString()
  });
});

// Get all online users
app.get("/api/users/online/all", (req, res) => {
  const onlineUsersList = Array.from(onlineUsers.keys());
  res.json({
    onlineUsers: onlineUsersList,
    count: onlineUsersList.length,
    timestamp: new Date().toISOString()
  });
});

// =============================================

// ================= DELIVER OFFLINE MESSAGES ENDPOINT =================
app.post("/api/messages/deliver-offline", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    console.log(`📨 Delivering offline messages from: ${senderId} to: ${receiverId}`);

    // Find all messages that were sent while receiver was offline
    const messages = await Message.find({
      senderId: senderId,
      receiverId: receiverId,
      isRead: false,
      delivered: false
    });

    console.log(`📨 Found ${messages.length} offline messages to deliver`);

    // Mark them as delivered
    const deliveredMessages = [];
    for (const msg of messages) {
      msg.delivered = true;
      await msg.save();
      deliveredMessages.push(msg);
    }

    // Emit delivered messages via socket
    if (global.io) {
      deliveredMessages.forEach(msg => {
        global.io.to(receiverId).emit("receiveMessage", msg);
      });
      console.log(`📨 Emitted ${deliveredMessages.length} messages via socket`);
    }

    res.json({
      success: true,
      deliveredMessages: deliveredMessages,
      count: deliveredMessages.length
    });
  } catch (error) {
    console.error("Error in deliverOfflineMessages:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

console.log("All Systems Ready");

app.get("/", (req, res) => {
  res.send("Server Running");
});

const PORT = process.env.PORT || 2036;

server.listen(PORT, () => {
  console.log(`🚀 Server Running On Port ${PORT}`);
  console.log(`📡 WebSocket Server Ready`);
  console.log(`👥 Online users tracking active`);
  console.log(`🎙️ Voice call system ready`);
  console.log(`📹 Video call system ready`);
});