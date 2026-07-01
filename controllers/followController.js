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

    // Check if already following
    const alreadyFollowing = sender.following.some(
      (id) => id.toString() === receiverId
    );

    if (alreadyFollowing) {
      return res.status(400).json({
        message: "Already following",
      });
    }

    // Check if receiver is already following sender (mutual follow)
    const receiverIsFollowingSender = receiver.following.some(
      (id) => id.toString() === senderId
    );

    // Check if request already sent
    const alreadyRequested = receiver.followRequests.some(
      (id) => id.toString() === senderId
    );

    if (alreadyRequested) {
      return res.status(400).json({
        message: "Request already sent",
      });
    }

    // IF RECEIVER IS ALREADY FOLLOWING SENDER - INSTANT MUTUAL FOLLOW
    if (receiverIsFollowingSender) {
      // Add each other to following/followers
      sender.following.push(receiverId);
      receiver.followers.push(senderId);

      await sender.save();
      await receiver.save();

      // Remove any pending requests
      receiver.followRequests = receiver.followRequests.filter(
        (id) => id.toString() !== senderId
      );
      await receiver.save();

      // Create notification for mutual follow
      await Notification.create({
        sender: senderId,
        receiver: receiverId,
        type: "follow_accepted",
        message: `${sender.name} followed you back`,
      });

      // Also notify the sender that they got followed back
      await Notification.create({
        sender: receiverId,
        receiver: senderId,
        type: "follow_accepted",
        message: `${receiver.name} accepted your follow request`,
      });

      // Send socket events
      if (global.io) {
        global.io.to(receiverId).emit("newNotification", {
          senderName: sender.name,
          senderId: senderId,
          type: "follow_accepted",
          message: `${sender.name} followed you back`,
          createdAt: new Date(),
        });

        global.io.to(senderId).emit("newNotification", {
          senderName: receiver.name,
          senderId: receiverId,
          type: "follow_accepted",
          message: `${receiver.name} accepted your follow request`,
          createdAt: new Date(),
        });

        global.io.to(senderId).emit("followAccepted", {
          acceptedBy: receiverId,
          acceptedUser: senderId,
        });

        global.io.to(receiverId).emit("followAccepted", {
          acceptedBy: senderId,
          acceptedUser: receiverId,
        });
      }

      return res.json({
        success: true,
        message: "You are now following each other!",
        mutualFollow: true,
      });
    }

    // NORMAL FOLLOW REQUEST (receiver is not following sender)
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
      mutualFollow: false,
    });
  } catch (error) {
    console.error("Send follow request error:", error);
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
    console.error("Get follow requests error:", error);
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

    // Create notification for requester
    await Notification.create({
      sender: currentUserId,
      receiver: requesterId,
      type: "request_accepted",
      message: `${currentUser.name} accepted your follow request`,
    });

    // Create notification for current user (follow back)
    await Notification.create({
      sender: requesterId,
      receiver: currentUserId,
      type: "follow",
      message: `${requester.name} is now following you`,
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

      global.io.to(currentUserId).emit("newNotification", {
        senderName: requester.name,
        senderId: requesterId,
        type: "follow",
        message: `${requester.name} is now following you`,
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
    console.error("Accept follow request error:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};

const rejectFollowRequest = async (req, res) => {
  try {
    const { currentUserId, requesterId } = req.body;
    
    const currentUser = await User.findById(currentUserId);

    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    currentUser.followRequests = currentUser.followRequests.filter(
      (id) => id.toString() !== requesterId
    );

    await currentUser.save();

    // Create notification for rejection
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
    console.error("Reject follow request error:", error);
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
    console.error("Get accepted users error:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};

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
    console.error("Get followers error:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};

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
    console.error("Get all connections error:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};

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

    // Also remove from followRequests if exists
    targetUser.followRequests = targetUser.followRequests.filter(
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
    console.error("Unfollow user error:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};

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
    console.error("Check following status error:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};

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
    console.error("Get mutual friends error:", error);
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