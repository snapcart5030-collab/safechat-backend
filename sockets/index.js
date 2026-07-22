const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Chat = require("../models/Chat");
const Message = require("../models/Message");

function initSockets(io) {
  io.on("connection", async (socket) => {
    const { token } = socket.handshake.auth || {};

    // Try admin token first, then user token. Sockets without a valid
    // token can still connect (e.g. a logged-out visitor) but won't join
    // any authenticated room.
    if (token) {
      let isAdminSocket = false;
      try {
        if (typeof token === "string" && token.includes("@")) {
          const admin = await Admin.findOne({ email: token.toLowerCase() });
          if (admin && (admin.role === "superadmin" || admin.status === "approved")) {
            socket.join("admins");
            socket.data.adminId = admin._id.toString();
            isAdminSocket = true;
            console.log(`🔌 Admin socket connected: ${admin.email}`);
          }
        }
      } catch (err) {
        console.error("Admin socket auth error:", err);
      }

      if (!isAdminSocket) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const user = await User.findById(decoded.id);
          if (user) {
            socket.join(`user:${user._id}`);
            socket.data.userId = user._id.toString();
            await User.findByIdAndUpdate(user._id, { lastActive: new Date() });
          }
        } catch {
          // invalid token on both — leave socket unauthenticated
        }
      }
    }

    // Real-time message send
    socket.on("sendMessage", async ({ chatId, text, mediaUrl }, callback) => {
      try {
        const senderId = socket.data.userId;
        if (!senderId) return callback?.({ error: "Not authenticated" });

        const chat = await Chat.findById(chatId);
        if (!chat || !chat.participants.some((p) => String(p) === senderId)) {
          return callback?.({ error: "Not part of this conversation" });
        }

        const message = await Message.create({ chat: chatId, sender: senderId, text: text || "", mediaUrl: mediaUrl || "" });
        chat.lastMessage = text || (mediaUrl ? "📷 Media" : "");
        chat.lastMessageAt = new Date();
        await chat.save();

        const populated = await message.populate("sender", "username avatar");

        chat.participants.forEach((p) => io.to(`user:${p}`).emit("newMessage", { chatId, message: populated }));
        io.to("admins").emit("admin:newMessage", { chatId, text: chat.lastMessage });

        callback?.({ success: true, message: populated });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    socket.on("typing", ({ chatId, to }) => {
      if (to) io.to(`user:${to}`).emit("typing", { chatId, from: socket.data.userId });
    });

    socket.on("disconnect", () => {
      // no-op — presence can be extended here later if needed
    });
  });

  // Periodic live stats push to admins
  setInterval(async () => {
    try {
      const [totalUsers, bannedUsers] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ status: "banned" }),
      ]);
      io.to("admins").emit("admin:stats", { totalUsers, bannedUsers });
    } catch {
      // ignore transient DB errors on the interval tick
    }
  }, 30000);
}

module.exports = initSockets;
