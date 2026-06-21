const express = require("express");

const router =
  express.Router();

const {
  sendMessage,
  getMessages,
   markRead
} = require(
  "../controllers/messageController"
);

router.post(
  "/send",
  sendMessage
);

router.get(
  "/:senderId/:receiverId",
  getMessages
);

router.post(
  "/mark-read",
  markRead
);

module.exports = router;