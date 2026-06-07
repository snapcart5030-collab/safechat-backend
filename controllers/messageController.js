const Message = require("../models/Message");
const User = require("../models/User");
const sendNotification = require("../utils/sendNotification");

const sendMessage = async (
  req,
  res
) => {
  try {
    const {
      senderId,
      receiverId,
      message,
    } = req.body;

    const newMessage =
      await Message.create({
        senderId,
        receiverId,
        message,
      });
      const receiverUser =
  await User.findById(receiverId);

if (
  receiverUser &&
  receiverUser.fcmToken
) {
  await sendNotification(
    receiverUser.fcmToken,
    "New Message",
    message
  );
}

    if (global.io) {
  global.io
    .to(receiverId)
    .emit(
      "receiveMessage",
      newMessage
    );

  global.io
    .to(senderId)
    .emit(
      "receiveMessage",
      newMessage
    );
}

    res.status(201).json(
      newMessage
    );
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getMessages = async (
  req,
  res
) => {
  try {
    const {
      senderId,
      receiverId,
    } = req.params;

    const messages =
      await Message.find({
        $or: [
          {
            senderId,
            receiverId,
          },
          {
            senderId:
              receiverId,
            receiverId:
              senderId,
          },
        ],
      }).sort({
        createdAt: 1,
      });

    res.json(messages);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  sendMessage,
  getMessages,
};