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

    if (global.io) {
      global.io.to(receiverId).emit("newNotification", {
        senderName: sender.name,
        senderId: senderId,
        type: "follow_request",
        message: `${sender.name} sent you a follow request`,
        createdAt: new Date(),
      });

      global.io.to(receiverId).emit("newFollowRequest", {
        senderId,
        senderName: sender.name,
      });
    }

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
      "_id name email picture username bio"
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

    if (global.io) {
      global.io.to(requesterId).emit("newNotification", {
        senderName: currentUser.name,
        senderId: currentUserId,
        type: "request_accepted",
        message: `${currentUser.name} accepted your follow request`,
        createdAt: new Date(),
      });

      // Emit to both users
      global.io.to(requesterId).emit("followAccepted", {
        acceptedBy: currentUserId,
        acceptedUser: requesterId,
      });

      global.io.to(currentUserId).emit("followAccepted", {
        acceptedBy: currentUserId,
        acceptedUser: requesterId,
      });
    }

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

    const requester = await User.findById(requesterId);

    await Notification.create({
      sender: currentUserId,
      receiver: requesterId,
      type: "request_rejected",
      message: `${currentUser.name} rejected your follow request`,
    });

    if (global.io) {
      global.io.to(requesterId).emit("newNotification", {
        senderName: currentUser.name,
        senderId: currentUserId,
        type: "request_rejected",
        message: `${currentUser.name} rejected your follow request`,
        createdAt: new Date(),
      });
    }

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
      "_id name email picture username bio"
    );
    res.json(user.following);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Get followers
const getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).populate(
      "followers",
      "_id name email picture username bio"
    );
    res.json(user.followers);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Get all connections (both following and followers)
const getAllConnections = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId)
      .populate("following", "_id name email picture username bio")
      .populate("followers", "_id name email picture username bio");

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

// Unfollow user
const unfollowUser = async (req, res) => {
  try {
    const { currentUserId, unfollowId } = req.body;

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(unfollowId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Check if following
    const isFollowing = currentUser.following.some(
      (id) => id.toString() === unfollowId
    );

    if (!isFollowing) {
      return res.status(400).json({
        message: "You are not following this user",
      });
    }

    // Remove from following and followers
    currentUser.following = currentUser.following.filter(
      (id) => id.toString() !== unfollowId
    );
    targetUser.followers = targetUser.followers.filter(
      (id) => id.toString() !== currentUserId
    );

    await currentUser.save();
    await targetUser.save();

    // Create notification for unfollow
    await Notification.create({
      sender: currentUserId,
      receiver: unfollowId,
      type: "unfollowed",
      message: `${currentUser.name} unfollowed you`,
    });

    if (global.io) {
      global.io.to(unfollowId).emit("newNotification", {
        senderName: currentUser.name,
        senderId: currentUserId,
        type: "unfollowed",
        message: `${currentUser.name} unfollowed you`,
        createdAt: new Date(),
      });

      global.io.to(currentUserId).emit("followUpdated", {
        userId: currentUserId,
        type: "unfollow",
        targetId: unfollowId,
      });
    }

    res.json({
      success: true,
      message: "Unfollowed successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Check if user is following another user
const checkFollowingStatus = async (req, res) => {
  try {
    const { currentUserId, targetUserId } = req.params;

    const currentUser = await User.findById(currentUserId);
    
    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const isFollowing = currentUser.following.some(
      (id) => id.toString() === targetUserId
    );

    const hasRequested = currentUser.followRequests.some(
      (id) => id.toString() === targetUserId
    );

    res.json({
      isFollowing,
      hasRequested,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Get mutual friends (users who follow each other)
const getMutualFriends = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId)
      .populate("following", "_id name email picture username bio")
      .populate("followers", "_id name email picture username bio");

    const mutualFriends = user.following.filter((followedUser) =>
      user.followers.some(
        (follower) => follower._id.toString() === followedUser._id.toString()
      )
    );

    res.json(mutualFriends);
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
  unfollowUser,
  checkFollowingStatus,
  getMutualFriends,
};