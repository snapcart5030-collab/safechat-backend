const User = require("../models/User");
const Notification = require("../models/Notification");
const sendNotification = require("../utils/sendNotification");

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

    // BLOCK CHECK - Check if sender has blocked receiver
    if (sender.blockedUsers.some((id) => id.toString() === receiverId)) {
      return res.status(403).json({
        success: false,
        message: "You have blocked this user. Cannot send follow request.",
      });
    }

    // BLOCK CHECK - Check if receiver has blocked sender
    if (receiver.blockedUsers.some((id) => id.toString() === senderId)) {
      return res.status(403).json({
        success: false,
        message: "You have been blocked by this user.",
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

    if (receiver.fcmToken) {
      await sendNotification(
        receiver.fcmToken,
        "New Follow Request",
        `${sender.name} sent you a follow request`
      );
    }

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
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Populate follow requests but filter out blocked users
    const populatedUser = await User.findById(userId).populate(
      "followRequests",
      "_id name email picture username bio"
    );

    // Filter out any users that the current user has blocked
    const filteredRequests = populatedUser.followRequests.filter(
      (requester) => !user.blockedUsers.some(
        (blockedId) => blockedId.toString() === requester._id.toString()
      )
    );

    res.json(filteredRequests);
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

    // BLOCK CHECK - Check if current user has blocked requester
    if (currentUser.blockedUsers.some((id) => id.toString() === requesterId)) {
      return res.status(403).json({
        success: false,
        message: "You have blocked this user. Cannot accept request.",
      });
    }

    // BLOCK CHECK - Check if requester has blocked current user
    if (requester.blockedUsers.some((id) => id.toString() === currentUserId)) {
      return res.status(403).json({
        success: false,
        message: "This user has blocked you. Cannot accept request.",
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

    if (requester.fcmToken) {
      await sendNotification(
        requester.fcmToken,
        "Follow Request Accepted",
        `${currentUser.name} accepted your follow request`
      );
    }

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
    const requester = await User.findById(requesterId);

    if (!currentUser || !requester) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // BLOCK CHECK - Check if current user has blocked requester
    if (currentUser.blockedUsers.some((id) => id.toString() === requesterId)) {
      return res.status(403).json({
        success: false,
        message: "You have blocked this user. Cannot reject request.",
      });
    }

    // BLOCK CHECK - Check if requester has blocked current user
    if (requester.blockedUsers.some((id) => id.toString() === currentUserId)) {
      return res.status(403).json({
        success: false,
        message: "This user has blocked you. Cannot reject request.",
      });
    }

    currentUser.followRequests = currentUser.followRequests.filter(
      (id) => id.toString() !== requesterId
    );

    await currentUser.save();

    await Notification.create({
      sender: currentUserId,
      receiver: requesterId,
      type: "request_rejected",
      message: `${currentUser.name} rejected your follow request`,
    });

    if (requester.fcmToken) {
      await sendNotification(
        requester.fcmToken,
        "Follow Request Rejected",
        `${currentUser.name} rejected your follow request`
      );
    }

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
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const populatedUser = await User.findById(userId).populate(
      "following",
      "_id name email picture username bio"
    );

    // Filter out blocked users
    const filteredFollowing = populatedUser.following.filter(
      (followedUser) => !user.blockedUsers.some(
        (blockedId) => blockedId.toString() === followedUser._id.toString()
      )
    );

    res.json(filteredFollowing);
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
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const populatedUser = await User.findById(userId).populate(
      "followers",
      "_id name email picture username bio"
    );

    // Filter out blocked users
    const filteredFollowers = populatedUser.followers.filter(
      (follower) => !user.blockedUsers.some(
        (blockedId) => blockedId.toString() === follower._id.toString()
      )
    );

    res.json(filteredFollowers);
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
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const populatedUser = await User.findById(userId)
      .populate("following", "_id name email picture username bio")
      .populate("followers", "_id name email picture username bio");

    // Combine both arrays and remove duplicates, then filter out blocked users
    const connections = [...populatedUser.following, ...populatedUser.followers];
    const uniqueConnections = connections.filter(
      (user, index, self) => 
        index === self.findIndex((u) => u._id.toString() === user._id.toString()) &&
        !populatedUser.blockedUsers.some(
          (blockedId) => blockedId.toString() === user._id.toString()
        )
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

    // BLOCK CHECK - Can still unfollow even if blocked, but don't show in lists
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

    // Check if blocked
    const isBlocked = currentUser.blockedUsers.some(
      (id) => id.toString() === targetUserId
    );

    res.json({
      isFollowing,
      hasRequested,
      isBlocked,
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
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const populatedUser = await User.findById(userId)
      .populate("following", "_id name email picture username bio")
      .populate("followers", "_id name email picture username bio");

    // Get mutual friends and filter out blocked users
    const mutualFriends = populatedUser.following.filter((followedUser) =>
      populatedUser.followers.some(
        (follower) => 
          follower._id.toString() === followedUser._id.toString() &&
          !populatedUser.blockedUsers.some(
            (blockedId) => blockedId.toString() === followedUser._id.toString()
          )
      )
    );

    res.json(mutualFriends);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// NEW: Block a user
const blockUser = async (req, res) => {
  try {
    const { currentUserId, blockUserId } = req.body;

    if (currentUserId === blockUserId) {
      return res.status(400).json({
        success: false,
        message: "You cannot block yourself",
      });
    }

    const currentUser = await User.findById(currentUserId);
    const userToBlock = await User.findById(blockUserId);

    if (!currentUser || !userToBlock) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if already blocked
    if (currentUser.blockedUsers.some((id) => id.toString() === blockUserId)) {
      return res.status(400).json({
        success: false,
        message: "User already blocked",
      });
    }

    // Add to blocked users
    currentUser.blockedUsers.push(blockUserId);

    // Remove from following/followers if any
    currentUser.following = currentUser.following.filter(
      (id) => id.toString() !== blockUserId
    );
    currentUser.followers = currentUser.followers.filter(
      (id) => id.toString() !== blockUserId
    );
    currentUser.followRequests = currentUser.followRequests.filter(
      (id) => id.toString() !== blockUserId
    );

    // Remove from other user's following/followers
    userToBlock.following = userToBlock.following.filter(
      (id) => id.toString() !== currentUserId
    );
    userToBlock.followers = userToBlock.followers.filter(
      (id) => id.toString() !== currentUserId
    );
    userToBlock.followRequests = userToBlock.followRequests.filter(
      (id) => id.toString() !== currentUserId
    );

    await currentUser.save();
    await userToBlock.save();

    // Emit block event
    if (global.io) {
      global.io.to(currentUserId).emit("userBlocked", {
        blockedUserId: blockUserId,
      });
      global.io.to(blockUserId).emit("userBlockedBy", {
        blockedByUserId: currentUserId,
      });
    }

    res.json({
      success: true,
      message: "User blocked successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// NEW: Unblock a user
const unblockUser = async (req, res) => {
  try {
    const { currentUserId, unblockUserId } = req.body;

    const currentUser = await User.findById(currentUserId);
    const userToUnblock = await User.findById(unblockUserId);

    if (!currentUser || !userToUnblock) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if not blocked
    if (!currentUser.blockedUsers.some((id) => id.toString() === unblockUserId)) {
      return res.status(400).json({
        success: false,
        message: "User is not blocked",
      });
    }

    // Remove from blocked users
    currentUser.blockedUsers = currentUser.blockedUsers.filter(
      (id) => id.toString() !== unblockUserId
    );

    await currentUser.save();

    // Emit unblock event
    if (global.io) {
      global.io.to(currentUserId).emit("userUnblocked", {
        unblockedUserId: unblockUserId,
      });
    }

    res.json({
      success: true,
      message: "User unblocked successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// NEW: Get blocked users list
const getBlockedUsers = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).populate(
      "blockedUsers",
      "_id name email picture username bio"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json(user.blockedUsers);
  } catch (error) {
    res.status(500).json({
      success: false,
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
  blockUser,
  unblockUser,
  getBlockedUsers,
};