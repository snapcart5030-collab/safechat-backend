const User = require("../models/User");

const sendFollowRequest = async (
  req,
  res
) => {
  try {
    const {
      senderId,
      receiverId,
    } = req.body;

    if (senderId === receiverId) {
      return res.status(400).json({
        message:
          "You cannot follow yourself",
      });
    }

    const sender =
      await User.findById(senderId);

    const receiver =
      await User.findById(receiverId);

    if (!sender || !receiver) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const alreadyRequested =
      receiver.followRequests.some(
        (id) =>
          id.toString() === senderId
      );

    if (alreadyRequested) {
      return res.status(400).json({
        message:
          "Request already sent",
      });
    }

    const alreadyFollowing =
      sender.following.some(
        (id) =>
          id.toString() === receiverId
      );

    if (alreadyFollowing) {
      return res.status(400).json({
        message:
          "Already following",
      });
    }

    receiver.followRequests.push(
      senderId
    );

    await receiver.save();

    res.json({
      success: true,
      message:
        "Follow request sent",
    });
  } catch (error) {
    res.status(500).json({
      message:
        error.message,
    });
  }
};

const getFollowRequests =
  async (req, res) => {
    try {
      const { userId } =
        req.params;

      const user =
        await User.findById(
          userId
        ).populate(
          "followRequests",
          "_id name email picture"
        );

      res.json(
        user.followRequests
      );
    } catch (error) {
      res.status(500).json({
        message:
          error.message,
      });
    }
  };

const acceptFollowRequest =
  async (req, res) => {
    try {
      const {
        currentUserId,
        requesterId,
      } = req.body;

      const currentUser =
        await User.findById(
          currentUserId
        );

      const requester =
        await User.findById(
          requesterId
        );

      if (
        !currentUser ||
        !requester
      ) {
        return res.status(404).json({
          message:
            "User not found",
        });
      }

      currentUser.followRequests =
        currentUser.followRequests.filter(
          (id) =>
            id.toString() !==
            requesterId
        );

      currentUser.followers.push(
        requesterId
      );

      requester.following.push(
        currentUserId
      );

      await currentUser.save();
      await requester.save();

      res.json({
        success: true,
        message:
          "Follow request accepted",
      });
    } catch (error) {
      res.status(500).json({
        message:
          error.message,
      });
    }
  };

const rejectFollowRequest =
  async (req, res) => {
    try {
      const {
        currentUserId,
        requesterId,
      } = req.body;

      const currentUser =
        await User.findById(
          currentUserId
        );

      currentUser.followRequests =
        currentUser.followRequests.filter(
          (id) =>
            id.toString() !==
            requesterId
        );

      await currentUser.save();

      res.json({
        success: true,
        message:
          "Request rejected",
      });
    } catch (error) {
      res.status(500).json({
        message:
          error.message,
      });
    }
  };

const getAcceptedUsers =
  async (req, res) => {
    try {
      const { userId } =
        req.params;

      const user =
        await User.findById(
          userId
        ).populate(
          "following",
          "_id name email picture"
        );

      res.json(
        user.following
      );
    } catch (error) {
      res.status(500).json({
        message:
          error.message,
      });
    }
  };

module.exports = {
  sendFollowRequest,
  getFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest,
  getAcceptedUsers,
};