const User = require("../models/User");
const Notification = require("../models/Notification");


const sendFollowRequest = async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    if (senderId === receiverId) {
      return res.status(400).json({
        message: "You cannot follow yourself",
      });
    }

    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);

    if (!sender || !receiver) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const alreadyRequested = receiver.followRequests.some(
      (id) => id.toString() === senderId
    );

    if (alreadyRequested) {
      return res.status(400).json({
        message: "Request already sent",
      });
    }

    const alreadyFollowing = sender.following.some(
      (id) => id.toString() === receiverId
    );

    if (alreadyFollowing) {
      return res.status(400).json({
        message: "Already following",
      });
    }

    receiver.followRequests.push(senderId);
    await receiver.save();

await Notification.create({
  sender: senderId,
  receiver: receiverId,
  type: "follow_request",
  message: `${sender.name} sent you a follow request`,
});

global.io.to(receiverId).emit(
  "newNotification",
  {
    senderName: sender.name,
    type: "follow_request",
    message: `${sender.name} sent you a follow request`,
    createdAt: new Date(),
  }
);

global.io.to(receiverId).emit(
  "newFollowRequest",
  {
    senderId,
    senderName: sender.name,
  }
);

    res.json({
      success: true,
      message: "Follow request sent",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getFollowRequests = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).populate(
      "followRequests",
      "_id name email picture"
    );
    res.json(user.followRequests);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const acceptFollowRequest = async (req, res) => {
  try {
    const { currentUserId, requesterId } = req.body;

    const currentUser = await User.findById(currentUserId);
    const requester = await User.findById(requesterId);

    if (!currentUser || !requester) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Remove from followRequests
    currentUser.followRequests = currentUser.followRequests.filter(
      (id) => id.toString() !== requesterId
    );

    // Add to followers and following
    currentUser.followers.push(requesterId);
    requester.following.push(currentUserId);

    await currentUser.save();
    await requester.save();

    await Notification.create({
  sender: currentUserId,
  receiver: requesterId,
  type: "request_accepted",
  message: `${currentUser.name} accepted your follow request`,
});

global.io.to(requesterId).emit(
  "newNotification",
  {
    senderName: currentUser.name,
    type: "request_accepted",
    message: `${currentUser.name} accepted your follow request`,
    createdAt: new Date(),
  }
);

    // Emit to both users
    global.io.to(requesterId).emit("followAccepted", {
      acceptedBy: currentUserId,
      acceptedUser: requesterId,
    });

    global.io.to(currentUserId).emit("followAccepted", {
      acceptedBy: currentUserId,
      acceptedUser: requesterId,
    });

    res.json({
      success: true,
      message: "Follow request accepted",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const rejectFollowRequest = async (req, res) => {
  try {
    const { currentUserId, requesterId } = req.body;
    const currentUser = await User.findById(currentUserId);

    currentUser.followRequests = currentUser.followRequests.filter(
      (id) => id.toString() !== requesterId
    );

    await currentUser.save();

    const requester =
  await User.findById(requesterId);

await Notification.create({
  sender: currentUserId,
  receiver: requesterId,
  type: "request_rejected",
  message: `${currentUser.name} rejected your follow request`,
});

global.io.to(requesterId).emit(
  "newNotification",
  {
    senderName: currentUser.name,
    type: "request_rejected",
    message: `${currentUser.name} rejected your follow request`,
    createdAt: new Date(),
  }
);

    res.json({
      success: true,
      message: "Request rejected",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getAcceptedUsers = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).populate(
      "following",
      "_id name email picture"
    );
    res.json(user.following);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// NEW: Get followers
const getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).populate(
      "followers",
      "_id name email picture"
    );
    res.json(user.followers);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// NEW: Get all connections (both following and followers)
const getAllConnections = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId)
      .populate("following", "_id name email picture")
      .populate("followers", "_id name email picture");

    // Combine both arrays and remove duplicates
    const connections = [...user.following, ...user.followers];
    const uniqueConnections = connections.filter(
      (user, index, self) => index === self.findIndex((u) => u._id.toString() === user._id.toString())
    );

    res.json(uniqueConnections);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  sendFollowRequest,
  getFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest,
  getAcceptedUsers,
  getFollowers,
  getAllConnections,
};