import AppSettings from "../models/AppSettings.js";

// Get Settings
export const getSettings = async (req, res) => {
  let settings = await AppSettings.findOne();

  if (!settings) {
    settings = await AppSettings.create({
      headerColor: "#8B1FF8",
    });
  }

  res.json(settings);
};

// Update Header Color
export const updateHeaderColor = async (req, res) => {
  const { headerColor } = req.body;

  let settings = await AppSettings.findOne();

  if (!settings) {
    settings = await AppSettings.create({
      headerColor,
    });
  } else {
    settings.headerColor = headerColor;
    await settings.save();
  }

  res.json({
    success: true,
    settings,
  });
};