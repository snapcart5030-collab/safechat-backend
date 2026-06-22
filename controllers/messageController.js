const Message = require("../models/Message");
const User = require("../models/User");
const sendNotification = require("../utils/sendNotification");

const sendMessage = async (
  req,
  res
) => {
  console.log("================================");
  console.log("SEND MESSAGE API CALLED");
  console.log("sender:", req.body.senderId);
  console.log("receiver:", req.body.receiverId);
  console.log("message:", req.body.message);
  console.log("================================");

  try {
    const {
      senderId,
      receiverId,
      message,
    } = req.body;

    const senderUser =
      await User.findById(senderId);

    const receiverUserCheck =
      await User.findById(receiverId);

    if (
      !senderUser ||
      !receiverUserCheck
    ) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const canChat =
      senderUser.following.some(
        (id) =>
          id.toString() === receiverId
      ) &&
      receiverUserCheck.followers.some(
        (id) =>
          id.toString() === senderId
      );

    if (!canChat) {
      return res.status(403).json({
        success: false,
        message:
          "Follow request not accepted",
      });
    }

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


const markRead = async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    const messages = await Message.find({
      senderId,
      receiverId,
      isRead: false,
    });

    for (const msg of messages) {
      msg.isRead = true;
      msg.readAt = new Date();
      msg.autoDeleteAt = new Date(
        Date.now() + 5000
      );

      await msg.save();
    }

    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  markRead
};