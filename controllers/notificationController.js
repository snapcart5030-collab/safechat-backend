const Notification = require("../models/Notification");

const getNotifications = async (
  req,
  res
) => {
  try {
    const { userId } = req.params;

    const notifications =
      await Notification.find({
        receiver: userId,
      })
        .populate(
          "sender",
          "name email picture"
        )
        .sort({
          createdAt: -1,
        });

    res.json(notifications);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getNotifications,
};