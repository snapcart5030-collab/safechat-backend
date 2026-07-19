// ==================== MAIN SERVER.JS ====================
require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

// ==================== DATABASE CONNECTION ====================
const connectDB = require("./config/db");

// ==================== MODELS ====================
const Message = require("./models/Message");
const User = require("./models/User");
const CallHistory = require("./models/CallHistory");

// ==================== WEBSITE ROUTES ====================
const websiteAuthRoutes = require("./routes/authRoutes");
const websiteUserRoutes = require("./routes/userRoutes");
const websiteMessageRoutes = require("./routes/messageRoutes");
const websiteAIAuthRoutes = require("./routes/aiRoutes");
const websiteFCMRoutes = require("./routes/fcmRoutes");
const websiteFollowRoutes = require("./routes/followRoutes");
const websiteNotificationRoutes = require("./routes/notificationRoutes");
const websiteChatCustomizationRoutes = require('./routes/chatCustomizationRoutes');
const websiteLiveLocationRoutes = require("./routes/liveLocationRoutes");
const websiteLanguageRoutes = require("./routes/languageRoutes");
const websiteAppSettingsRoutes = require("./routes/appSettingsRoutes.js");

// ==================== ADMIN ROUTES ====================
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const adminRoutes = require("./routes/adminRoutes");

// ==================== UTILITIES ====================
const seedDefaultAdmin = require("./utils/seedAdmin");
const { resolvePeerSocketId } = require("./utils/socketRouting");

// ==================== APP SETUP ====================
const app = express();
const server = http.createServer(app);

// ==================== CORS CONFIGURATION ====================
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

console.log("✅ Allowed origins:", allowedOrigins);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.use(express.json());
app.use("/uploads", express.static("uploads"));

// ==================== SOCKET.IO SETUP ====================
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"],
  },
});

global.io = io;

// Socket authentication - different for website and admin
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("unauthorized"));
    
    // Check if it's admin token or user token
    try {
      // Try admin JWT first
      const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
      socket.userId = decoded.id.toString();
      socket.isAdmin = true;
      return next();
    } catch (adminErr) {
      // Try website JWT
      const decoded = jwt.verify(token, process.env.WEBSITE_JWT_SECRET);
      socket.userId = decoded.id.toString();
      socket.isAdmin = false;
      return next();
    }
  } catch (_) {
    return next(new Error("unauthorized"));
  }
});

// ==================== ROUTES ====================

// Health check
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    service: "safechat-backend",
    admin: "available at /api/admin"
  });
});

// ==================== WEBSITE ROUTES ====================
app.use("/api/auth", websiteAuthRoutes);
app.use("/api/users", websiteUserRoutes);
app.use("/api/messages", websiteMessageRoutes);
app.use("/api/ai", websiteAIAuthRoutes);
app.use("/api/fcm", websiteFCMRoutes);
app.use("/api/follow", websiteFollowRoutes);
app.use("/api/notifications", websiteNotificationRoutes);
app.use("/api/chat-customization", websiteChatCustomizationRoutes);
app.use("/api/location", websiteLiveLocationRoutes);
app.use("/api/language", websiteLanguageRoutes);
app.use("/api/settings", websiteAppSettingsRoutes);

// ==================== ADMIN ROUTES (Separate) ====================
app.use("/api/admin", adminAuthRoutes);  // Admin auth
app.use("/api/admin", adminRoutes);      // Admin dashboard

// ==================== ONLINE USERS TRACKING ====================
const onlineUsers = new Map();
const userSocketMap = new Map();
const activeVoiceCalls = new Map();
const activeVideoCalls = new Map();
const activeLocationSharing = new Map();

// Helper function to get socket ID from user ID
const getSocketIdFromUserId = (userId) => {
  const userSockets = onlineUsers.get(userId);
  if (userSockets && userSockets.size > 0) {
    return [...userSockets][0];
  }
  return null;
};

// ==================== SOCKET.IO EVENTS ====================
io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);
  
  const authenticatedUserId = socket.userId;
  const isAdmin = socket.isAdmin || false;

  socket.join(authenticatedUserId);
  userSocketMap.set(socket.id, authenticatedUserId);
  
  if (!onlineUsers.has(authenticatedUserId)) {
    onlineUsers.set(authenticatedUserId, new Set());
  }
  onlineUsers.get(authenticatedUserId).add(socket.id);
  
  io.emit("userOnline", authenticatedUserId);

  // ========== WEBSITE SOCKET EVENTS (Only for regular users) ==========
  if (!isAdmin) {
    // All website socket events from code 2 go here
    // ========== BLOCK/UNBLOCK EVENTS ==========
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

    // Unblock event
    socket.on("unblockUser", async (data) => {
      const { unblockerId, unblockedId, unblockerName, unblockedName } = data;
      console.log(`🔓 ${unblockerName} unblocked ${unblockedName}`);
      
      try {
        const User = require("../models/User");
        const unblocker = await User.findById(unblockerId);
        const unblocked = await User.findById(unblockedId);

        const wasConnected = unblocker.previousConnections && 
          unblocker.previousConnections.some(id => id.toString() === unblockedId);

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

        io.to(unblockerId).emit("userUnblockedSuccess", {
          unblockedUser: unblockedId,
          unblockedName: unblockedName,
          connectionRestored: wasConnected,
          timestamp: new Date(),
        });

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

        if (wasConnected) {
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
        }
      } catch (error) {
        console.error("Error in unblock socket event:", error);
      }
    });

    // Blocked user message
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

    // Join room and sync messages
    socket.on("join", async () => {
      const userId = authenticatedUserId;
      socket.join(userId);
      socket.userId = userId;
      userSocketMap.set(socket.id, userId);

      console.log(`✅ User Joined Room: ${userId}`);
      
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

    // Follow accepted
    socket.on("acceptFollowRequest", (data) => {
      io.to(data.requesterId).emit("followAccepted", {
        currentUserId: data.currentUserId,
      });
    });

    // Profile viewed
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

    // User seen chat
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

    // Typing events
    socket.on("typing", (data) => {
      console.log("Typing Event:", data);
      io.to(data.receiverId).emit("showTyping", {
        senderId: data.senderId,
      });
    });

    socket.on("stopTyping", (data) => {
      console.log("Stop Typing Event:", data);
      io.to(data.receiverId).emit("hideTyping");
    });

    // ========== VOICE CALL SIGNALING ==========
    // Voice call request
    socket.on("voice-call-request", (data) => {
      const { callId, callerId, receiverId, callerName, receiverName } = data;
      
      if (!callId || callerId !== authenticatedUserId || !receiverId || callerId === receiverId) return;
      
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
      
      setTimeout(async () => {
        const currentCall = activeVoiceCalls.get(callId);
        if (!currentCall) return;
        if (currentCall.status === "calling") {
          try {
            await CallHistory.create({
              callId: callId,
              callerId: currentCall.callerId,
              receiverId: currentCall.receiverId,
              callType: "voice",
              status: "missed",
              startedAt: currentCall.startTime,
              endedAt: new Date(),
              duration: 0
            });
          } catch (err) {
            console.error("Error saving missed call:", err);
          }
          
          io.to(currentCall.callerSocketId).emit("voice-call-rejected", {
            callId,
            message: "No Answer"
          });
          io.to(currentCall.receiverSocketId).emit("voice-call-ended-by-other", {
            callId
          });
          activeVoiceCalls.delete(callId);
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
    });

    // Accept voice call
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
    });

    // Reject voice call
    socket.on("reject-voice-call", async (data) => {
      const { callId, callerId, receiverId, callerSocketId } = data;
      
      console.log(`❌ Voice call rejected: ${callId} by ${receiverId}`);
      
      const call = activeVoiceCalls.get(callId);
      if (call) {
        try {
          await CallHistory.create({
            callId: callId,
            callerId: call.callerId,
            receiverId: call.receiverId,
            callType: "voice",
            status: "rejected",
            startedAt: call.startTime,
            endedAt: new Date(),
            duration: 0
          });
        } catch (err) {
          console.error("Error saving rejected call:", err);
        }
      }
      
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
    });

    // WebRTC offer
    socket.on("voice-call-offer", (data) => {
      const { offer, targetSocketId, callId, callerId, receiverId } = data;
      
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
    });

    // WebRTC answer
    socket.on("voice-call-answer", (data) => {
      const { answer, targetSocketId, callId, callerId, receiverId } = data;
      
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
    });

    // Voice ICE candidate
    socket.on("voice-ice-candidate", (data) => {
      const { candidate, targetSocketId, callId, callerId, receiverId } = data;
      
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
    });

    // Voice call ended
    socket.on("voice-call-ended", async (data) => {
      const { callId, callerId, receiverId } = data;
      
      console.log(`📞 Voice call ended: ${callId}`);
      
      const call = activeVoiceCalls.get(callId);
      if (call) {
        const duration = Math.floor((new Date() - call.startTime) / 1000);
        
        try {
          await CallHistory.create({
            callId: callId,
            callerId: call.callerId,
            receiverId: call.receiverId,
            callType: "voice",
            status: call.status === "calling" ? "missed" : "ended",
            startedAt: call.startTime,
            endedAt: new Date(),
            duration: duration
          });
        } catch (err) {
          console.error("Error saving call history:", err);
        }
        
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
      }
    });

    // Voice call busy
    socket.on("voice-call-busy", (data) => {
      const { callId, callerId, receiverId } = data;
      console.log(`🔴 Voice call busy: ${callId}`);
      
      io.to(callerId).emit("voice-call-busy", {
        callId,
        callerId,
        receiverId,
        message: "User is busy"
      });
      
      activeVoiceCalls.delete(callId);
    });

    // ========== VIDEO CALL SIGNALING ==========
    // Video call request
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
    });

    // Accept video call
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
    });

    // Reject video call
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
    });

    // Video WebRTC offer
    socket.on("video-call-offer", (data) => {
      const { offer, targetSocketId, callId, callerId, receiverId } = data;
      
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
    });

    // Video WebRTC answer
    socket.on("video-call-answer", (data) => {
      const { answer, targetSocketId, callId, callerId, receiverId } = data;
      
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
    });

    // Video ICE candidate
    socket.on("video-ice-candidate", (data) => {
      const { candidate, targetSocketId, callId, callerId, receiverId } = data;
      
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
    });

    // Video call ended
    socket.on("video-call-ended", async (data) => {
      const { callId, callerId, receiverId } = data;
      
      console.log(`📹 Video call ended: ${callId}`);
      
      const call = activeVideoCalls.get(callId);
      if (call) {
        const duration = Math.floor((new Date() - call.startTime) / 1000);
        
        try {
          await CallHistory.create({
            callId: callId,
            callerId: call.callerId,
            receiverId: call.receiverId,
            callType: "video",
            status: call.status === "calling" ? "missed" : "ended",
            startedAt: call.startTime,
            endedAt: new Date(),
            duration: duration
          });
        } catch (err) {
          console.error("Error saving video call history:", err);
        }
        
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
      }
    });

    // Video call busy
    socket.on("video-call-busy", (data) => {
      const { callId, callerId, receiverId } = data;
      console.log(`🔴 Video call busy: ${callId}`);
      
      io.to(callerId).emit("video-call-busy", {
        callId,
        callerId,
        receiverId,
        message: "User is busy"
      });
      
      activeVideoCalls.delete(callId);
    });

    // ========== LOCATION SHARING ==========
    socket.on("join-location-room", ({ requestId }) => {
      console.log("📍 Joined Location Room:", requestId);
      socket.join(requestId);
    });

    socket.on("share-location-request", (data) => {
      io.to(data.receiverId).emit("incoming-location-request", data);
    });

    socket.on("accept-location", (data) => {
      activeLocationSharing.set(data.shareId, {
        senderId: data.senderId,
        receiverId: data.receiverId,
        startedAt: new Date()
      });
      
      io.to(data.senderId).emit("location-accepted", data);
    });

    socket.on("reject-location", (data) => {
      io.to(data.senderId).emit("location-rejected", data);
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

    socket.on("stop-location-sharing", (data) => {
      if (!data?.requestId) return;
      
      activeLocationSharing.delete(data.requestId);
      io.to(data.requestId).emit("location-sharing-stopped", {
        ...data,
        userId: data.userId,
        timestamp: Date.now(),
      });
    });

  } // End of website socket events

  // ========== ADMIN SOCKET EVENTS (Only for admins) ==========
  if (isAdmin) {
    console.log(`👑 Admin connected: ${authenticatedUserId}`);
    
    // Admin specific events
    socket.on("admin-dashboard", (data) => {
      console.log("Admin dashboard request:", data);
      // Admin dashboard logic here
    });

    // Add more admin events as needed
  }

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

    // Clean up voice calls
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
      }
    }

    // Clean up video calls
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
      }
    }
  });

});

// ==================== API ENDPOINTS ====================

// Get user online status
app.get("/api/users/:id/status", (req, res) => {
  const userId = req.params.id;
  const isOnline = onlineUsers.has(userId);
  res.json({
    userId,
    online: isOnline,
    timestamp: new Date().toISOString()
  });
});

// Get multiple users status
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

// Get call history
app.get("/api/calls/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`📞 Fetching call history for user: ${userId}`);
    
    const calls = await CallHistory.find({
      $or: [
        { callerId: userId },
        { receiverId: userId }
      ]
    })
    .populate('callerId', 'name profilePicture')
    .populate('receiverId', 'name profilePicture')
    .sort({ createdAt: -1 })
    .limit(100);
    
    res.json({
      success: true,
      calls: calls
    });
  } catch (error) {
    console.error("Error fetching call history:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete single call history
app.delete("/api/calls/history/:callId", async (req, res) => {
  try {
    const { callId } = req.params;
    await CallHistory.findByIdAndDelete(callId);
    res.json({
      success: true,
      message: "Call history deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting call history:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete all call history for a user
app.delete("/api/calls/history/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    await CallHistory.deleteMany({
      $or: [
        { callerId: userId },
        { receiverId: userId }
      ]
    });
    res.json({
      success: true,
      message: "All call history deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting call history:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Deliver offline messages
app.post("/api/messages/deliver-offline", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;
    console.log(`📨 Delivering offline messages from: ${senderId} to: ${receiverId}`);
    
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
      success: false,
      message: error.message
    });
  }
});

// ==================== 404 HANDLER ====================
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ 
    message: "Server error", 
    error: err.message 
  });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();
    await seedDefaultAdmin();
    
    server.listen(PORT, () => {
      console.log(`🚀 Server Running On Port ${PORT}`);
      console.log(`📡 WebSocket Server Ready`);
      console.log(`👥 Online users tracking active`);
      console.log(`🎙️ Voice call system ready`);
      console.log(`📹 Video call system ready`);
      console.log(`🛡️ Admin system ready`);
      console.log(`\n📍 Website URL: http://localhost:${PORT}/api/auth/login`);
      console.log(`📍 Admin URL: http://localhost:${PORT}/api/admin/login`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();