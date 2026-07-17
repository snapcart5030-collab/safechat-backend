const User = require("../models/User");

exports.updateLanguage = async (req, res) => {
  try {
    const { userId, language } = req.body;

    const allowedLanguages = ["en", "mr", "hi", "te"];

    if (!allowedLanguages.includes(language)) {
      return res.status(400).json({
        success: false,
        message: "Invalid language",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        language,
        languageSelected: true,
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "Language updated successfully",
      user,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.getLanguage = async (req, res) => {

    try {

        const { userId } = req.params;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false
            });
        }

        res.json({
            success: true,
            language: user.language
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            message: err.message
        });

    }

};