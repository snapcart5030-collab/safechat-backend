const User = require("../models/User");

const saveToken = async (req, res) => {
  try {
    const { userId, token } = req.body;

    await User.findByIdAndUpdate(userId, {
      fcmToken: token,
    });

    res.status(200).json({
      success: true,
      message: "FCM Token Saved",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  saveToken,
};