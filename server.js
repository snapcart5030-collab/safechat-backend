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

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

global.io = io;

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

// ================= ONLINE USERS TRACKING =================
const onlineUsers = new Map(); // Store userId -> socketId mapping

// ================= SOCKET.IO =================
io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  // Join personal room and track online status
  socket.on("join", (userId) => {
    socket.join(userId);
    
    // Store online user
    const previousSocketId = onlineUsers.get(userId);
    if (previousSocketId && previousSocketId !== socket.id) {
      // User had another connection, remove it
      const previousSocket = io.sockets.sockets.get(previousSocketId);
      if (previousSocket) {
        previousSocket.leave(userId);
      }
    }
    
    onlineUsers.set(userId, socket.id);
    
    // Broadcast to all connected users that this user is online
    socket.broadcast.emit("userOnline", userId);
    
    console.log(`✅ User Joined Room: ${userId}`);
    console.log(`📊 Online Users (${onlineUsers.size}):`, Array.from(onlineUsers.keys()));
  });

  // Follow Accepted
  socket.on("acceptFollowRequest", (data) => {
    io.to(data.requesterId).emit("followAccepted", {
      currentUserId: data.currentUserId,
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

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("❌ User Disconnected:", socket.id);
    
    // Find and remove disconnected user
    let disconnectedUserId = null;
    for (let [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        onlineUsers.delete(userId);
        break;
      }
    }
    
    // Broadcast to all connected users that this user is offline
    if (disconnectedUserId) {
      socket.broadcast.emit("userOffline", disconnectedUserId);
      console.log(`📴 User ${disconnectedUserId} is now offline`);
    }
    
    console.log(`📊 Online Users (${onlineUsers.size}):`, Array.from(onlineUsers.keys()));
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

console.log("All Systems Ready");

app.get("/", (req, res) => {
  res.send("Server Running");
});

const PORT = process.env.PORT || 2036;

server.listen(PORT, () => {
  console.log(`🚀 Server Running On Port ${PORT}`);
  console.log(`📡 WebSocket Server Ready`);
  console.log(`👥 Online users tracking active`);
});