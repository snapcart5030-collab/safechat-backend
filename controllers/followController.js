const User = require("../models/User");
const Notification = require("../models/Notification");
const Message = require("../models/Message");
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
      sender.following.push(receiverId);
      receiver.followers.push(senderId);

      await sender.save();
      await receiver.save();

      receiver.followRequests = receiver.followRequests.filter(
        (id) => id.toString() !== senderId
      );
      await receiver.save();

      await Notification.create({
        sender: senderId,
        receiver: receiverId,
        type: "follow_accepted",
        message: `${sender.name} followed you back`,
      });

      await Notification.create({
        sender: receiverId,
        receiver: senderId,
        type: "follow_accepted",
        message: `${receiver.name} accepted your follow request`,
      });

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

    const populatedUser = await User.findById(userId).populate(
      "followRequests",
      "_id name email picture username bio"
    );

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

    if (currentUser.blockedUsers.some((id) => id.toString() === requesterId)) {
      return res.status(403).json({
        success: false,
        message: "You have blocked this user. Cannot accept request.",
      });
    }

    if (requester.blockedUsers.some((id) => id.toString() === currentUserId)) {
      return res.status(403).json({
        success: false,
        message: "This user has blocked you. Cannot accept request.",
      });
    }

    currentUser.followRequests = currentUser.followRequests.filter(
      (id) => id.toString() !== requesterId
    );

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

    const isFollowing = currentUser.following.some(
      (id) => id.toString() === unfollowId
    );

    if (!isFollowing) {
      return res.status(400).json({
        message: "You are not following this user",
      });
    }

    currentUser.following = currentUser.following.filter(
      (id) => id.toString() !== unfollowId
    );
    targetUser.followers = targetUser.followers.filter(
      (id) => id.toString() !== currentUserId
    );

    targetUser.followRequests = targetUser.followRequests.filter(
      (id) => id.toString() !== currentUserId
    );

    await currentUser.save();
    await targetUser.save();

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

// ========== FIXED BLOCK FUNCTIONS ==========

const blockUser = async (req, res) => {
  try {
    const { userId, blockedUserId } = req.body;

    if (userId === blockedUserId) {
      return res.status(400).json({
        message: "You cannot block yourself.",
      });
    }

    const user = await User.findById(userId);
    const blockedUser = await User.findById(blockedUserId);

    if (!user || !blockedUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Check if already blocked
    if (user.blockedUsers.some(id => id.toString() === blockedUserId)) {
      return res.status(400).json({
        message: "User already blocked",
      });
    }

    // ========== CRITICAL FIX: Store previous connection BEFORE blocking ==========
    // Check if they are connected (following each other)
    const userFollowsBlocked = user.following.some(id => id.toString() === blockedUserId);
    const blockedFollowsUser = blockedUser.following.some(id => id.toString() === userId);
    const areConnected = userFollowsBlocked || blockedFollowsUser;

    // Store previous connection in a separate field
    if (areConnected) {
      // Initialize previousConnections if it doesn't exist
      if (!user.previousConnections) user.previousConnections = [];
      if (!blockedUser.previousConnections) blockedUser.previousConnections = [];

      // Store connection for both users
      if (!user.previousConnections.some(id => id.toString() === blockedUserId)) {
        user.previousConnections.push(blockedUserId);
      }
      if (!blockedUser.previousConnections.some(id => id.toString() === userId)) {
        blockedUser.previousConnections.push(userId);
      }

      console.log(`✅ Stored previous connection between ${user.name} and ${blockedUser.name}`);
    }

    // ========== FIX: DO NOT DELETE FOLLOW RELATIONSHIP ==========
    // Instead, we just add to blockedUsers array
    // The follow relationship stays intact but is hidden/disabled

    // Add to blocked list ONLY - DON'T remove from following/followers
    user.blockedUsers.push(blockedUserId);
    await user.save();

    // Remove any pending follow requests (these are temporary)
    user.followRequests = user.followRequests.filter(
      (id) => id.toString() !== blockedUserId
    );
    await blockedUser.updateOne({
      $pull: {
        followRequests: userId,
      },
    });

    // Remove any blocked messages from this user if they sent one before
    if (blockedUser.blockedMessages) {
      blockedUser.blockedMessages = blockedUser.blockedMessages.filter(
        (bm) => bm.blockerId.toString() !== userId
      );
      await blockedUser.save();
    }

    // ===== SOCKET EVENTS =====
    if (global.io) {
      // Notify blocked user
      global.io.to(blockedUserId).emit("userBlocked", {
        by: userId,
        byName: user.name,
        message: `${user.name} has blocked you`,
        blocked: true,
        timestamp: new Date(),
        connectionPreserved: areConnected, // Let frontend know connection is preserved
      });

      // Notify blocker
      global.io.to(userId).emit("userBlockedSuccess", {
        blockedUser: blockedUserId,
        blockedName: blockedUser.name,
        timestamp: new Date(),
        connectionPreserved: areConnected,
      });

      // Update chat list for both users - show blocked but connection preserved
      global.io.to(blockedUserId).emit("chatListUpdated", {
        userId: blockedUserId,
        chatWith: userId,
        blocked: true,
        blockedBy: userId,
        connectionPreserved: areConnected,
        lastMessage: `${user.name} has blocked you`,
        lastMessageTime: new Date(),
      });

      global.io.to(userId).emit("chatListUpdated", {
        userId: userId,
        chatWith: blockedUserId,
        blocked: true,
        blockedBy: userId,
        connectionPreserved: areConnected,
        lastMessage: `You blocked ${blockedUser.name}`,
        lastMessageTime: new Date(),
      });
    }

    res.json({
      success: true,
      message: "User blocked successfully.",
      data: {
        blockedUserId,
        blockedName: blockedUser.name,
        connectionPreserved: areConnected,
      },
    });
  } catch (err) {
    console.error("Block user error:", err);
    res.status(500).json({
      message: err.message,
    });
  }
};

// ========== FIXED UNBLOCK FUNCTION - RESTORES CONNECTION ==========
const unblockUser = async (req, res) => {
  try {
    const { userId, blockedUserId } = req.body;

    const user = await User.findById(userId);
    const unblockedUser = await User.findById(blockedUserId);

    if (!user || !unblockedUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // ========== Check if they were previously connected ==========
    const wasConnected = user.previousConnections && 
      user.previousConnections.some(id => id.toString() === blockedUserId);

    // Remove from blocked list
    user.blockedUsers = user.blockedUsers.filter(
      (id) => id.toString() !== blockedUserId
    );

    // ========== RESTORE CONNECTION IF THEY WERE CONNECTED ==========
    if (wasConnected) {
      console.log(`🔄 Restoring connection between ${user.name} and ${unblockedUser.name}`);

      // Add to following/followers if not already there
      if (!user.following.some(id => id.toString() === blockedUserId)) {
        user.following.push(blockedUserId);
      }
      if (!unblockedUser.following.some(id => id.toString() === userId)) {
        unblockedUser.following.push(userId);
      }

      // Also add to followers
      if (!user.followers.some(id => id.toString() === blockedUserId)) {
        user.followers.push(blockedUserId);
      }
      if (!unblockedUser.followers.some(id => id.toString() === userId)) {
        unblockedUser.followers.push(userId);
      }

      // Remove from previousConnections since it's restored
      user.previousConnections = user.previousConnections.filter(
        (id) => id.toString() !== blockedUserId
      );
      unblockedUser.previousConnections = unblockedUser.previousConnections.filter(
        (id) => id.toString() !== userId
      );

      console.log(`✅ Connection restored between ${user.name} and ${unblockedUser.name}`);
    }

    await user.save();
    await unblockedUser.save();

    // ===== SOCKET EVENTS =====
    if (global.io) {
      // Notify unblocked user
      global.io.to(blockedUserId).emit("userUnblocked", {
        by: userId,
        byName: user.name,
        message: wasConnected 
          ? `${user.name} has unblocked you. Your connection has been restored! You can chat again.`
          : `${user.name} has unblocked you. You can chat again!`,
        unblocked: true,
        connectionRestored: wasConnected,
        timestamp: new Date(),
      });

      // Notify blocker
      global.io.to(userId).emit("userUnblockedSuccess", {
        unblockedUser: blockedUserId,
        unblockedName: unblockedUser.name,
        connectionRestored: wasConnected,
        timestamp: new Date(),
      });

      // Update chat list - REMOVE BLOCKED STATUS
      global.io.to(blockedUserId).emit("chatListUpdated", {
        userId: blockedUserId,
        chatWith: userId,
        blocked: false,
        unblocked: true,
        connectionRestored: wasConnected,
        lastMessage: wasConnected 
          ? `${user.name} has unblocked you. Your connection has been restored!`
          : `${user.name} has unblocked you. You can chat now!`,
        lastMessageTime: new Date(),
      });

      global.io.to(userId).emit("chatListUpdated", {
        userId: userId,
        chatWith: blockedUserId,
        blocked: false,
        unblocked: true,
        connectionRestored: wasConnected,
        lastMessage: wasConnected 
          ? `You unblocked ${unblockedUser.name}. Your connection has been restored!`
          : `You unblocked ${unblockedUser.name}. You can chat now!`,
        lastMessageTime: new Date(),
      });

      // Notify both that chat is restored
      global.io.to(userId).emit("chatRestored", {
        with: blockedUserId,
        name: unblockedUser.name,
        connectionRestored: wasConnected,
      });
      
      global.io.to(blockedUserId).emit("chatRestored", {
        with: userId,
        name: user.name,
        connectionRestored: wasConnected,
      });

      // If connection was restored, emit follow restored event
      if (wasConnected) {
        global.io.to(userId).emit("followRestored", {
          with: blockedUserId,
          name: unblockedUser.name,
          message: `Your connection with ${unblockedUser.name} has been restored!`,
        });
        
        global.io.to(blockedUserId).emit("followRestored", {
          with: userId,
          name: user.name,
          message: `Your connection with ${user.name} has been restored!`,
        });
      }
    }

    res.json({
      success: true,
      message: wasConnected 
        ? "User unblocked successfully. Connection restored!"
        : "User unblocked successfully.",
      data: {
        unblockedUserId: blockedUserId,
        unblockedName: unblockedUser.name,
        connectionRestored: wasConnected,
      },
    });
  } catch (err) {
    console.error("Unblock user error:", err);
    res.status(500).json({
      message: err.message,
    });
  }
};

const getBlockedUsers = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .populate("blockedUsers", "name email picture username bio");

    // Check if any blocked users sent one-time messages
    const blockedUsersWithStatus = await Promise.all(
      user.blockedUsers.map(async (blockedUser) => {
        // Check if this user sent a blocked message
        const blockedUserDoc = await User.findById(blockedUser._id);
        let blockedMessage = null;
        if (blockedUserDoc && blockedUserDoc.blockedMessages) {
          const msg = blockedUserDoc.blockedMessages.find(
            (bm) => bm.blockerId.toString() === id
          );
          if (msg) blockedMessage = msg;
        }

        // Check if they were previously connected
        const wasConnected = user.previousConnections && 
          user.previousConnections.some(pid => pid.toString() === blockedUser._id.toString());

        return {
          ...blockedUser.toObject(),
          oneTimeSent: !!blockedMessage,
          oneTimeMessage: blockedMessage?.message || null,
          oneTimeSentAt: blockedMessage?.sentAt || null,
          wasConnected: wasConnected || false,
          connectionPreserved: wasConnected || false,
        };
      })
    );

    res.json(blockedUsersWithStatus);
  } catch (err) {
    console.error("Get blocked users error:", err);
    res.status(500).json({
      message: err.message,
    });
  }
};

// ========== USER FUNCTIONS ==========

const getUsers = async (req, res) => {
  try {
    const currentUserId = req.query.currentUserId;

    const users = await User.find({
      _id: { $ne: currentUserId },
    });

    const currentUser = await User.findById(currentUserId);

    const usersWithLastMessage = await Promise.all(
      users.map(async (user) => {
        const isBlocked = currentUser?.blockedUsers?.some(
          (id) => id.toString() === user._id.toString()
        ) || false;

        const isBlockedByUser = user.blockedUsers?.some(
          (id) => id.toString() === currentUserId
        ) || false;

        // Check for one-time message
        let oneTimeMessage = null;
        if (isBlockedByUser && user.blockedMessages) {
          const blockedMsg = user.blockedMessages.find(
            (bm) => bm.blockerId.toString() === currentUserId
          );
          if (blockedMsg) oneTimeMessage = blockedMsg;
        }

        const lastMessage = await Message.findOne({
          $or: [
            { senderId: currentUserId, receiverId: user._id },
            { senderId: user._id, receiverId: currentUserId },
          ],
        }).sort({ createdAt: -1 });

        const messageCount = await Message.countDocuments({
          senderId: user._id,
          receiverId: currentUserId,
        });

        return {
          ...user.toObject(),
          lastMessage: oneTimeMessage?.message || lastMessage?.message || "",
          lastMessageTime: oneTimeMessage?.sentAt || lastMessage?.createdAt || null,
          messageCount,
          isBlocked: isBlocked || isBlockedByUser,
          blockedBy: isBlocked ? currentUserId : isBlockedByUser ? user._id : null,
          oneTimeSent: !!oneTimeMessage,
        };
      })
    );

    res.json(usersWithLastMessage);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { id, name, picture } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { name, picture },
      { new: true }
    );

    res.json(user);
  } catch (error) {
    res.status(500).json({
      message: error.message,
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
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ],
    }).select("_id name email picture username bio");

    const usersWithStatus = users.map((user) => ({
      ...user.toObject(),
      isFollowing: currentUser?.following?.some(
        (id) => id.toString() === user._id.toString()
      ) || false,
      requestSent: currentUser?.followRequests?.some(
        (id) => id.toString() === user._id.toString()
      ) || false,
      isBlocked: currentUser?.blockedUsers?.some(
        (id) => id.toString() === user._id.toString()
      ) || false,
      wasConnected: currentUser?.previousConnections?.some(
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

const checkBlockStatus = async (req, res) => {
  try {
    const { userId, targetUserId } = req.params;

    const user = await User.findById(userId);
    const targetUser = await User.findById(targetUserId);

    if (!user || !targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userBlockedTarget = user.blockedUsers.some(
      (id) => id.toString() === targetUserId
    );
    const targetBlockedUser = targetUser.blockedUsers.some(
      (id) => id.toString() === userId
    );

    // Check if they were previously connected
    const wasConnected = user.previousConnections && 
      user.previousConnections.some(id => id.toString() === targetUserId);

    let oneTimeMessage = null;
    let oneTimeSent = false;
    if (targetBlockedUser && targetUser.blockedMessages) {
      const blockedMsg = targetUser.blockedMessages.find(
        (bm) => bm.blockerId.toString() === userId
      );
      if (blockedMsg) {
        oneTimeMessage = blockedMsg.message;
        oneTimeSent = true;
      }
    }

    res.json({
      blocked: userBlockedTarget || targetBlockedUser,
      blockedBy: userBlockedTarget ? userId : targetBlockedUser ? targetUserId : null,
      oneTimeSent: oneTimeSent,
      oneTimeMessage: oneTimeMessage,
      canChat: !(userBlockedTarget || targetBlockedUser),
      wasConnected: wasConnected || false,
      // Check if they're still following each other (if not blocked)
      isFollowing: !(userBlockedTarget || targetBlockedUser) && user.following.some(id => id.toString() === targetUserId),
      isFollower: !(userBlockedTarget || targetBlockedUser) && user.followers.some(id => id.toString() === targetUserId),
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getUsers,
  updateProfile,
  searchUsers,
  getUserById,
  blockUser,
  unblockUser,
  getBlockedUsers,
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
  checkBlockStatus,
};