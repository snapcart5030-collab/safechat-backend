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

// ================= SOCKET.IO =================
// ================= SOCKET.IO =================
io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  // Join personal room
  socket.on("join", (userId) => {
    socket.join(userId);
    console.log(`User Joined Room: ${userId}`);
  });

  // Follow Request
  socket.on(
    "sendFollowRequest",
    (data) => {
      io.to(
        data.receiverId
      ).emit(
        "newFollowRequest",
        {
          senderId:
            data.senderId,
        }
      );
    }
  );

  // Follow Accepted
  socket.on(
    "acceptFollowRequest",
    (data) => {
      io.to(
        data.requesterId
      ).emit(
        "followAccepted",
        {
          currentUserId:
            data.currentUserId,
        }
      );
    }
  );

  // Typing Start
  socket.on("typing", (data) => {
    console.log(
      "Typing Event:",
      data
    );

    io.to(
      data.receiverId
    ).emit("showTyping", {
      senderId:
        data.senderId,
    });
  });

  // Typing Stop
  socket.on(
    "stopTyping",
    (data) => {
      console.log(
        "Stop Typing Event:",
        data
      );

      io.to(
        data.receiverId
      ).emit("hideTyping");
    }
  );

  socket.on(
    "disconnect",
    () => {
      console.log(
        "User Disconnected:",
        socket.id
      );
    }
  );
});
// ==============================================
// ==============================================

console.log("All Systems Ready");

app.get("/", (req, res) => {
  res.send("Server Running");
});

const PORT = process.env.PORT || 2036;

server.listen(PORT, () => {
  console.log(`Server Running On Port ${PORT}`);
});