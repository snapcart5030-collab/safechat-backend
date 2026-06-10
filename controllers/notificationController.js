const Notification = require("../models/Notification");

const getNotifications = async (req, res) => {
  try {
    const { userId } = req.params;

    const notifications = await Notification.find({
      receiver: userId,
    })
      .populate("sender", "name email picture")
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

const markNotificationsRead = async (req, res) => {
  try {
    const { userId } = req.body;

    await Notification.updateMany(
      {
        receiver: userId,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
        },
      }
    );

    res.json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// ✅ ADD THIS NEW FUNCTION TO SAVE NOTIFICATIONS TO DATABASE
const saveNotification = async (notificationData) => {
  try {
    const notification = new Notification({
      sender: notificationData.senderId,
      receiver: notificationData.receiverId,
      type: notificationData.type,
      message: notificationData.message,
    });
    
    await notification.save();
    return notification;
  } catch (error) {
    console.log("Error saving notification:", error);
    return null;
  }
};

module.exports = {
  getNotifications,
  markNotificationsRead,
  saveNotification,  // ✅ EXPORT THIS
};