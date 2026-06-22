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
        users.map(async (user) => {
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

          const messageCount =
            await Message.countDocuments({
              senderId:
                user._id,
              receiverId:
                currentUserId,
            });

          return {
            ...user.toObject(),

            lastMessage:
              lastMessage?.message ||
              "",

            lastMessageTime:
              lastMessage?.createdAt ||
              null,

            messageCount,
          };
        })
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



const searchUsers = async (req, res) => {
  try {
    const { q, currentUserId } = req.query;

    if (!q) {
      return res.json([]);
    }

    const currentUser = await User.findById(currentUserId);

    const users = await User.find({
      _id: { $ne: currentUserId },
      $or: [
        {
          name: {
            $regex: q,
            $options: "i",
          },
        },
        {
          email: {
            $regex: q,
            $options: "i",
          },
        },
      ],
    }).select("_id name email picture");

    const usersWithStatus = users.map((user) => ({
      ...user.toObject(),

      isFollowing:
        currentUser?.following?.some(
          (id) => id.toString() === user._id.toString()
        ) || false,

      requestSent:
        currentUser?.followRequests?.some(
          (id) => id.toString() === user._id.toString()
        ) || false,
    }));

    res.json(usersWithStatus);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};


const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id).select('-followRequests');
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


module.exports = {
  getUsers,
  updateProfile,
  searchUsers,
   getUserById,
};