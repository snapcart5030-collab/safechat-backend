const express = require("express");
const router = express.Router();

const {
  sendMessage,
  getMessages,
  markRead,
  getLastMessage,
  getAllConversations,
  markSeen,
  getUnreadCount,
  deleteMessage,
  deliverOfflineMessages, // Add this
} = require("../controllers/messageController");

// Send a message
router.post("/send", sendMessage);

// Get messages between two users
router.get("/:senderId/:receiverId", getMessages);

// Mark messages as read
router.post("/mark-read", markRead);

// Get last message between two users
router.get("/last/:userId/:chatWithId", getLastMessage);

// Get all conversations for a user with last messages
router.get("/conversations/:userId", getAllConversations);

// Mark messages as seen
router.post("/mark-seen", markSeen);

// Get unread message count
router.get("/unread/:userId", getUnreadCount);

// Delete a message
router.delete("/:messageId", deleteMessage);

// Deliver offline messages
router.post("/deliver-offline", deliverOfflineMessages);

module.exports = router;