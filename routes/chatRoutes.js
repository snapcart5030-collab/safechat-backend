const express = require("express");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const Report = require("../models/Report");
const { protectUser } = require("../middleware/auth");

const router = express.Router();

// Get or create a 1:1 conversation with another user
router.post("/with/:userId", protectUser, async (req, res) => {
  const otherId = req.params.userId;

  let chat = await Chat.findOne({
    participants: { $all: [req.user._id, otherId], $size: 2 },
  }).populate("participants", "username avatar");

  if (!chat) {
    chat = await Chat.create({ participants: [req.user._id, otherId] });
    chat = await chat.populate("participants", "username avatar");
  }

  res.json({ chat });
});

// List my conversations
router.get("/", protectUser, async (req, res) => {
  const chats = await Chat.find({ participants: req.user._id })
    .populate("participants", "username avatar")
    .sort({ lastMessageAt: -1 });
  res.json({ chats });
});

// Get messages in a conversation
router.get("/:chatId/messages", protectUser, async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);
  if (!chat || !chat.participants.some((p) => String(p) === String(req.user._id))) {
    return res.status(403).json({ message: "Not part of this conversation" });
  }

  const messages = await Message.find({ chat: req.params.chatId })
    .sort({ createdAt: 1 })
    .populate("sender", "username avatar");

  res.json({ messages });
});

// Send a message (REST fallback — normally sent via socket "sendMessage")
router.post("/:chatId/messages", protectUser, async (req, res) => {
  const { text, mediaUrl } = req.body;
  const chat = await Chat.findById(req.params.chatId);
  if (!chat || !chat.participants.some((p) => String(p) === String(req.user._id))) {
    return res.status(403).json({ message: "Not part of this conversation" });
  }

  const message = await Message.create({
    chat: chat._id,
    sender: req.user._id,
    text: text || "",
    mediaUrl: mediaUrl || "",
  });

  chat.lastMessage = text || (mediaUrl ? "📷 Media" : "");
  chat.lastMessageAt = new Date();
  await chat.save();

  const populated = await message.populate("sender", "username avatar");

  const io = req.app.get("io");
  chat.participants.forEach((p) => io?.to(`user:${p}`).emit("newMessage", { chatId: chat._id, message: populated }));
  io?.to("admins").emit("admin:newMessage", { chatId: chat._id, text: chat.lastMessage });

  res.status(201).json({ message: populated });
});

// Report a conversation
router.post("/:chatId/report", protectUser, async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);
  if (!chat) return res.status(404).json({ message: "Conversation not found" });

  const report = await Report.create({
    chat: chat._id,
    reportedBy: req.user._id,
    reason: req.body.reason || "Reported by user",
  });

  res.status(201).json({ message: "Report submitted", report });
});

module.exports = router;
