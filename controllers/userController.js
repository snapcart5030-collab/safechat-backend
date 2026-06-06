const User = require("../models/User");

const getUsers = async (
  req,
  res
) => {
  try {
    const users = await User.find();

    res.json(users);
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

module.exports = {
  getUsers,
  updateProfile,
};