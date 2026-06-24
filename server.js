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

// ================= ONLINE USERS TRACKING =================
const onlineUsers = new Map(); // Store userId -> socketId mapping
const activeVoiceCalls = new Map(); // Store active calls

// ================= SOCKET.IO =================
io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  socket.on("join", (userId) => {
    socket.join(userId);

    socket.userId = userId;

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

  // Handle voice call request
  socket.on("voice-call-request", (data) => {
    const { callerId, receiverId, callerName, receiverName, callId } = data;

    console.log(`📞 Voice call request from ${callerName} to ${receiverName}`);
    console.log(`Caller ID: ${callerId}, Receiver ID: ${receiverId}`);

    const receiverSockets = onlineUsers.get(receiverId);

    if (!receiverSockets || receiverSockets.size === 0) {
      console.log(`❌ User ${receiverId} is offline`);
      socket.emit("voice-call-user-offline", { receiverId });
      return;
    }

    const receiverSocketId = [...receiverSockets][0];

    console.log("Receiver Socket:", receiverSocketId);

    console.log(`✅ User ${receiverId} is online, sending call...`);

    activeVoiceCalls.set(callId, {
      callerId,
      receiverId,
      callerSocketId: socket.id,
      receiverSocketId,
      status: "calling",
      startTime: new Date()
    });
console.log("Sending call to socket:", receiverSocketId);
    // Emit incoming call to receiver
    io.to(receiverSocketId).emit("incoming-voice-call", {
      callId,
      callerId,
      receiverId,
      callerName,
      receiverName,
      callerSocketId: socket.id
    });

    console.log(`✅ Incoming call sent to ${receiverName}`);
  });

  // Handle accept voice call
  socket.on("accept-voice-call", (data) => {
    const { callId, callerId, receiverId, callerSocketId } = data;

    console.log(`✅ Voice call accepted: ${callId}`);

    const call = activeVoiceCalls.get(callId);
    if (call) {
      call.status = "connected";
      activeVoiceCalls.set(callId, call);
    }

    // Notify caller that call is accepted
    io.to(callerSocketId).emit("voice-call-accepted", {
      callId,
      callerId,
      receiverId,
      receiverSocketId: socket.id
    });

    console.log(`✅ Call accepted notification sent to caller`);
  });

  // Handle reject voice call
  socket.on("reject-voice-call", (data) => {
    const { callId, callerId, receiverId, callerSocketId } = data;

    console.log(`❌ Voice call rejected: ${callId}`);

    // Remove call from active calls
    activeVoiceCalls.delete(callId);

    // Notify caller that call is rejected
    io.to(callerSocketId).emit("voice-call-rejected", {
      callId,
      callerId,
      receiverId
    });

    console.log(`❌ Call rejection sent to caller`);
  });

  // Handle WebRTC offer
  socket.on("voice-call-offer", (data) => {
    const { offer, targetSocketId, callId } = data;

    console.log(`📡 Sending WebRTC offer for call: ${callId}`);

    io.to(targetSocketId).emit("voice-call-offer", {
      offer,
      callId,
      fromSocketId: socket.id
    });
  });

  // Handle WebRTC answer
  socket.on("voice-call-answer", (data) => {
    const { answer, targetSocketId, callId } = data;

    console.log(`📡 Sending WebRTC answer for call: ${callId}`);

    io.to(targetSocketId).emit("voice-call-answer", {
      answer,
      callId,
      fromSocketId: socket.id
    });
  });

  // Handle ICE candidates
  socket.on("voice-ice-candidate", (data) => {
    const { candidate, targetSocketId, callId } = data;

    console.log(`🧊 Sending ICE candidate for call: ${callId}`);

    io.to(targetSocketId).emit("voice-ice-candidate", {
      candidate,
      callId,
      fromSocketId: socket.id
    });
  });

  // Handle call end
  socket.on("voice-call-ended", (data) => {
    const { callId, callerId, receiverId } = data;

    console.log(`📞 Voice call ended: ${callId}`);

    const call = activeVoiceCalls.get(callId);
    if (call) {
      // Notify the other participant
      if (call.callerSocketId && call.callerSocketId !== socket.id) {
        io.to(call.callerSocketId).emit("voice-call-ended-by-other", { callId });
      }
      if (call.receiverSocketId && call.receiverSocketId !== socket.id) {
        io.to(call.receiverSocketId).emit("voice-call-ended-by-other", { callId });
      }
      activeVoiceCalls.delete(callId);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ User Disconnected:", socket.id);

    if (socket.userId) {
      const userSockets = onlineUsers.get(socket.userId);

      if (userSockets) {
        userSockets.delete(socket.id);

        if (userSockets.size === 0) {
          onlineUsers.delete(socket.userId);

          io.emit("userOffline", socket.userId);

          console.log(
            `📴 User ${socket.userId} is offline`
          );
        }
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