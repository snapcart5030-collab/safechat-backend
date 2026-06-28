require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

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
const liveLocationRoutes = require("./routes/liveLocationRoutes");


const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

global.io = io;

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
const activeLocationSharing = new Map();

// ================= SOCKET.IO =================
io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  socket.on("join", (userId) => {
    socket.join(userId);
    socket.userId = userId;
    
    // Store socket to user mapping
    userSocketMap.set(socket.id, userId);

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }

    onlineUsers.get(userId).add(socket.id);

    io.emit("userOnline", userId);

    console.log(`✅ User Joined Room: ${userId}`);
    console.log(
      `📊 Online Users (${onlineUsers.size}):`,
      Array.from(onlineUsers.keys())
    );
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
  socket.on("voice-call-request", (data) => {
    const { callId, callerId, receiverId, callerName, receiverName } = data;

    console.log(`📞 Voice call request from ${callerName} (${callerId}) to ${receiverName} (${receiverId})`);

    // Check if receiver is online
    const receiverSockets = onlineUsers.get(receiverId);

    if (!receiverSockets || receiverSockets.size === 0) {
      console.log(`❌ User ${receiverId} is offline`);
      socket.emit("voice-call-user-offline", { 
        receiverId,
        message: "User is offline"
      });
      return;
    }

    // Get first socket of receiver
    const receiverSocketId = [...receiverSockets][0];

    // Store call info with both socket IDs
    activeVoiceCalls.set(callId, {
      callerId,
      receiverId,
      callerName,
      receiverName,
      callerSocketId: socket.id,
      receiverSocketId: receiverSocketId,
      status: "calling",
      startTime: new Date()
    });

    // Send incoming call to receiver
    io.to(receiverSocketId).emit("incoming-voice-call", {
      callId,
      callerId,
      receiverId,
      callerName,
      receiverName,
      callerSocketId: socket.id,
      receiverSocketId: receiverSocketId
    });

    console.log(`✅ Incoming call sent to ${receiverName} (${receiverSocketId})`);
  });

  // Handle accept voice call - User B accepts call from User A
  socket.on("accept-voice-call", (data) => {
    const { callId, callerId, receiverId, callerSocketId } = data;

    console.log(`✅ Voice call accepted: ${callId} by ${receiverId}`);

    const call = activeVoiceCalls.get(callId);
    if (call) {
      call.status = "connected";
      call.receiverSocketId = socket.id; // Update with actual socket
      activeVoiceCalls.set(callId, call);
    }

    // Notify caller that call is accepted
    io.to(callerSocketId).emit("voice-call-accepted", {
      callId,
      callerId,
      receiverId,
      receiverSocketId: socket.id
    });

    console.log(`✅ Call accepted notification sent to caller (${callerSocketId})`);
  });

  // Handle reject voice call - User B rejects call from User A
  socket.on("reject-voice-call", (data) => {
    const { callId, callerId, receiverId, callerSocketId } = data;

    console.log(`❌ Voice call rejected: ${callId} by ${receiverId}`);

    // Remove call from active calls
    activeVoiceCalls.delete(callId);

    // Notify caller that call is rejected
    io.to(callerSocketId).emit("voice-call-rejected", {
      callId,
      callerId,
      receiverId,
      message: "Call rejected"
    });

    console.log(`❌ Call rejection sent to caller (${callerSocketId})`);
  });

  // Handle WebRTC offer - Caller sends offer to Receiver
  socket.on("voice-call-offer", (data) => {
    const { offer, targetSocketId, callId, callerId, receiverId } = data;

    console.log(`📡 Sending WebRTC offer for call: ${callId} to targetSocket: ${targetSocketId}`);
    console.log(`📡 Caller: ${callerId}, Receiver: ${receiverId}`);

    // Try to get the target socket ID from the call if not provided
   const call = activeVoiceCalls.get(callId);

if (!call) return;

let targetId;

if (socket.id === call.callerSocketId) {
    targetId = call.receiverSocketId;
} else {
    targetId = call.callerSocketId;
}

    if (!targetId) {
      console.error(`❌ No target socket found for call ${callId}`);
      socket.emit("voice-call-error", {
        callId,
        message: "Target socket not found"
      });
      return;
    }

    // Send offer to target
    io.to(targetId).emit("voice-call-offer", {
      offer,
      callId,
      callerId,
      receiverId,
      fromSocketId: socket.id
    });

    console.log(`✅ Offer sent to socket: ${targetId}`);
  });

  // Handle WebRTC answer - Receiver sends answer to Caller
  socket.on("voice-call-answer", (data) => {
    const { answer, targetSocketId, callId, callerId, receiverId } = data;

    console.log(`📡 Sending WebRTC answer for call: ${callId} to targetSocket: ${targetSocketId}`);
    console.log(`📡 Caller: ${callerId}, Receiver: ${receiverId}`);

    // Try to get the target socket ID from the call if not provided
  const call = activeVoiceCalls.get(callId);

if (!call) {
    console.log("❌ Call not found:", callId);
    return;
}

const targetId = call.receiverSocketId;

    if (!targetId) {
      console.error(`❌ No target socket found for call ${callId}`);
      socket.emit("voice-call-error", {
        callId,
        message: "Target socket not found"
      });
      return;
    }

    // Send answer to target
    io.to(targetId).emit("voice-call-answer", {
      answer,
      callId,
      callerId,
      receiverId,
      fromSocketId: socket.id
    });

    console.log(`✅ Answer sent to socket: ${targetId}`);
  });

  // Handle ICE candidates with improved error handling
  socket.on("voice-ice-candidate", (data) => {
    const { candidate, targetSocketId, callId, callerId, receiverId } = data;

    console.log(`🧊 Sending ICE candidate for call: ${callId} to targetSocket: ${targetSocketId}`);

    // Try to get the target socket ID from the call if not provided
    const call = activeVoiceCalls.get(callId);

if (!call) {
    console.log("❌ Call not found:", callId);
    return;
}

const targetId = call.callerSocketId;

    if (!targetId) {
      console.error(`❌ No target socket found for ICE candidate ${callId}`);
      return;
    }

    // Send ICE candidate to target
    io.to(targetId).emit("voice-ice-candidate", {
      candidate,
      callId,
      callerId,
      receiverId,
      fromSocketId: socket.id
    });

    console.log(`✅ ICE candidate sent to socket: ${targetId}`);
  });

  // Handle call end with proper cleanup
  socket.on("voice-call-ended", (data) => {
    const { callId, callerId, receiverId } = data;

    console.log(`📞 Voice call ended: ${callId}`);

    const call = activeVoiceCalls.get(callId);
    if (call) {
      // Notify the other participant
      if (call.callerSocketId && call.callerSocketId !== socket.id) {
        io.to(call.callerSocketId).emit("voice-call-ended-by-other", { 
          callId,
          endedBy: socket.userId || "unknown"
        });
      }
      if (call.receiverSocketId && call.receiverSocketId !== socket.id) {
        io.to(call.receiverSocketId).emit("voice-call-ended-by-other", { 
          callId,
          endedBy: socket.userId || "unknown"
        });
      }
      activeVoiceCalls.delete(callId);
      console.log(`🧹 Call ${callId} cleaned up`);
    } else {
      // If call not found, broadcast to both participants
      if (callerId) {
        io.to(callerId).emit("voice-call-ended-by-other", { 
          callId,
          endedBy: socket.userId || "unknown"
        });
      }
      if (receiverId) {
        io.to(receiverId).emit("voice-call-ended-by-other", { 
          callId,
          endedBy: socket.userId || "unknown"
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

  // Stop Sharing
  socket.on("stop-location-sharing", (data) => {
    activeLocationSharing.delete(data.requestId);
    io.to(data.requestId).emit(
      "location-sharing-stopped",
      data
    );
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
        console.log(`🧹 Cleaned up call ${callId} due to disconnect`);
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
});