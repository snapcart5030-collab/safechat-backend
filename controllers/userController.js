const User = require("../models/User");
const Message = require("../models/Message");

const getUsers = async (req, res) => {
  try {
    const currentUserId =
      req.query.currentUserId;

    const users =
      await User.find({
        _id: {
          $ne: currentUserId,
        },
      });

    const usersWithLastMessage =
      await Promise.all(
        users.map(
          async (user) => {
            const lastMessage =
              await Message.findOne({
                $or: [
                  {
                    senderId:
                      currentUserId,
                    receiverId:
                      user._id,
                  },
                  {
                    senderId:
                      user._id,
                    receiverId:
                      currentUserId,
                  },
                ],
              }).sort({
                createdAt: -1,
              });

            return {
              ...user.toObject(),

              lastMessage:
                lastMessage?.message ||
                "",

              lastMessageTime:
                lastMessage?.createdAt ||
                null,
            };
          }
        )
      );

    res.json(
      usersWithLastMessage
    );
  } catch (error) {
    res.status(500).json({
      message:
        error.message,
    });
  }
};

const updateProfile = async (
  req,
  res
) => {
  try {
    const {
      id,
      name,
      picture,
    } = req.body;

    const user =
      await User.findByIdAndUpdate(
        id,
        {
          name,
          picture,
        },
        {
          new: true,
        }
      );

    res.json(user);
  } catch (error) {
    res.status(500).json({
      message:
        error.message,
    });
  }
};

module.exports = {
  getUsers,
  updateProfile,
};