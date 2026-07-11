// routes/messageRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const attachmentUpload = require("../config/attachmentUpload");

const {
  sendMessage,
  getMessages,
  markRead,
  getLastMessage,
  getAllConversations,
  markSeen,
  getUnreadCount,
  deleteMessage,
  deliverOfflineMessages,
  uploadAttachment,
  reactToMessage,
  editMessage,
  starMessage,
  pinMessage,
  getSharedMedia,
} = require("../controllers/messageController");

// Secure all routes
router.use(protect);

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

// Upload rich file attachments
router.post("/upload", attachmentUpload.single("file"), uploadAttachment);

// Toggle emoji reaction
router.post("/:messageId/react", reactToMessage);

// Edit message text
router.put("/:messageId/edit", editMessage);

// Star/unstar message
// Note: PUT /:messageId/star
router.put("/:messageId/star", starMessage);

// Pin/unpin message
// Note: PUT /:messageId/pin
router.put("/:messageId/pin", pinMessage);

// Get shared media/files
router.get("/shared-media/:userId/:chatWithId", getSharedMedia);

module.exports = router;