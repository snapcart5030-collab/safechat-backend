const ChatCustomization = require('../models/ChatCustomization');
const cloudinary = require('../config/cloudinary');

// Save new customization
exports.saveCustomization = async (req, res) => {
  try {
    const { userId, ...customizationData } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'userId is required' 
      });
    }

    const existing = await ChatCustomization.findOne({ userId });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Customization already exists for this user. Use update endpoint.',
      });
    }

    const customization = new ChatCustomization({
      userId,
      ...customizationData,
    });

    await customization.save();

    res.status(201).json({
      success: true,
      message: 'Chat customization saved successfully',
      data: customization,
    });
  } catch (error) {
    console.error('Save customization error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving chat customization',
      error: error.message,
    });
  }
};

// Get customization by userId
exports.getCustomization = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    let customization = await ChatCustomization.findOne({ userId });
    
    if (!customization) {
      customization = {
        userId,
        backgroundImage: { url: null, publicId: null },
        opacity: 1,
        blur: 0,
        overlay: 0,
        theme: 'light',
        senderBubbleColor: '#0084ff',
        receiverBubbleColor: '#e4e6eb',
        fontSize: 14,
        fontFamily: 'system-ui',
        effect: 'none',
      };
    }

    res.status(200).json({
      success: true,
      data: customization,
    });
  } catch (error) {
    console.error('Get customization error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching chat customization',
      error: error.message,
    });
  }
};

// Update customization
exports.updateCustomization = async (req, res) => {
  try {
    const { userId, backgroundImage, ...updateData } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    let finalUpdateData = { ...updateData };
    
    if (backgroundImage) {
      finalUpdateData.backgroundImage = backgroundImage;
    }

    const customization = await ChatCustomization.findOneAndUpdate(
      { userId },
      { $set: finalUpdateData },
      { new: true, runValidators: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Chat customization updated successfully',
      data: customization,
    });
  } catch (error) {
    console.error('Update customization error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating chat customization',
      error: error.message,
    });
  }
};

// Delete customization and associated image
exports.deleteCustomization = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    const customization = await ChatCustomization.findOne({ userId });
    
    if (!customization) {
      return res.status(404).json({
        success: false,
        message: 'Customization not found for this user',
      });
    }

    if (customization.backgroundImage && customization.backgroundImage.publicId) {
      try {
        await cloudinary.uploader.destroy(customization.backgroundImage.publicId);
      } catch (cloudinaryError) {
        console.error('Cloudinary delete error:', cloudinaryError);
      }
    }

    await ChatCustomization.findOneAndDelete({ userId });

    res.status(200).json({
      success: true,
      message: 'Chat customization deleted successfully',
    });
  } catch (error) {
    console.error('Delete customization error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting chat customization',
      error: error.message,
    });
  }
};

// Upload background image
exports.uploadBackgroundImage = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded',
      });
    }

    const oldCustomization = await ChatCustomization.findOne({ userId });
    
    if (oldCustomization && oldCustomization.backgroundImage?.publicId) {
      try {
        await cloudinary.uploader.destroy(oldCustomization.backgroundImage.publicId);
      } catch (error) {
        console.error('Error deleting old image:', error);
      }
    }

    const backgroundImage = {
      url: req.file.path,
      publicId: req.file.filename,
    };

    const customization = await ChatCustomization.findOneAndUpdate(
      { userId },
      { 
        $set: { 
          backgroundImage,
          updatedAt: new Date(),
        } 
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Background image uploaded successfully',
      data: {
        backgroundImage,
        customization,
      },
    });
  } catch (error) {
    console.error('Upload background error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading background image',
      error: error.message,
    });
  }
};

// Delete background image only
exports.deleteBackgroundImage = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    const customization = await ChatCustomization.findOne({ userId });
    
    if (!customization) {
      return res.status(404).json({
        success: false,
        message: 'Customization not found',
      });
    }

    if (customization.backgroundImage?.publicId) {
      try {
        await cloudinary.uploader.destroy(customization.backgroundImage.publicId);
      } catch (error) {
        console.error('Cloudinary delete error:', error);
      }
    }

    customization.backgroundImage = { url: null, publicId: null };
    await customization.save();

    res.status(200).json({
      success: true,
      message: 'Background image deleted successfully',
      data: customization,
    });
  } catch (error) {
    console.error('Delete background error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting background image',
      error: error.message,
    });
  }
};

// Update background opacity
exports.updateOpacity = async (req, res) => {
  try {
    const { userId, opacity } = req.body;
    
    if (!userId || opacity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'userId and opacity are required',
      });
    }

    if (opacity < 0 || opacity > 1) {
      return res.status(400).json({
        success: false,
        message: 'Opacity must be between 0 and 1',
      });
    }

    const customization = await ChatCustomization.findOneAndUpdate(
      { userId },
      { $set: { opacity } },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Opacity updated successfully',
      data: customization,
    });
  } catch (error) {
    console.error('Update opacity error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating opacity',
      error: error.message,
    });
  }
};

// Update blur
exports.updateBlur = async (req, res) => {
  try {
    const { userId, blur } = req.body;
    
    if (!userId || blur === undefined) {
      return res.status(400).json({
        success: false,
        message: 'userId and blur are required',
      });
    }

    if (blur < 0 || blur > 20) {
      return res.status(400).json({
        success: false,
        message: 'Blur must be between 0 and 20',
      });
    }

    const customization = await ChatCustomization.findOneAndUpdate(
      { userId },
      { $set: { blur } },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Blur updated successfully',
      data: customization,
    });
  } catch (error) {
    console.error('Update blur error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating blur',
      error: error.message,
    });
  }
};

// Update overlay
exports.updateOverlay = async (req, res) => {
  try {
    const { userId, overlay } = req.body;
    
    if (!userId || overlay === undefined) {
      return res.status(400).json({
        success: false,
        message: 'userId and overlay are required',
      });
    }

    if (overlay < 0 || overlay > 1) {
      return res.status(400).json({
        success: false,
        message: 'Overlay must be between 0 and 1',
      });
    }

    const customization = await ChatCustomization.findOneAndUpdate(
      { userId },
      { $set: { overlay } },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Overlay updated successfully',
      data: customization,
    });
  } catch (error) {
    console.error('Update overlay error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating overlay',
      error: error.message,
    });
  }
};

// Update theme
exports.updateTheme = async (req, res) => {
  try {
    const { userId, theme } = req.body;
    
    if (!userId || !theme) {
      return res.status(400).json({
        success: false,
        message: 'userId and theme are required',
      });
    }

    const validThemes = ['light', 'dark', 'amoled'];
    if (!validThemes.includes(theme)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid theme. Must be light, dark, or amoled',
      });
    }

    const customization = await ChatCustomization.findOneAndUpdate(
      { userId },
      { $set: { theme } },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Theme updated successfully',
      data: customization,
    });
  } catch (error) {
    console.error('Update theme error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating theme',
      error: error.message,
    });
  }
};

// Update bubble colors
exports.updateBubbleColors = async (req, res) => {
  try {
    const { userId, senderBubbleColor, receiverBubbleColor } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    const updateData = {};
    if (senderBubbleColor) updateData.senderBubbleColor = senderBubbleColor;
    if (receiverBubbleColor) updateData.receiverBubbleColor = receiverBubbleColor;

    const customization = await ChatCustomization.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Bubble colors updated successfully',
      data: customization,
    });
  } catch (error) {
    console.error('Update bubble colors error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating bubble colors',
      error: error.message,
    });
  }
};

// Update font settings
exports.updateFontSettings = async (req, res) => {
  try {
    const { userId, fontSize, fontFamily } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
      });
    }

    const updateData = {};
    if (fontSize) {
      if (fontSize < 10 || fontSize > 24) {
        return res.status(400).json({
          success: false,
          message: 'Font size must be between 10 and 24',
        });
      }
      updateData.fontSize = fontSize;
    }
    if (fontFamily) updateData.fontFamily = fontFamily;

    const customization = await ChatCustomization.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Font settings updated successfully',
      data: customization,
    });
  } catch (error) {
    console.error('Update font settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating font settings',
      error: error.message,
    });
  }
};

// Update effect
exports.updateEffect = async (req, res) => {
  try {
    const { userId, effect } = req.body;
    
    if (!userId || !effect) {
      return res.status(400).json({
        success: false,
        message: 'userId and effect are required',
      });
    }

    const validEffects = ['none', 'rain', 'snow', 'stars', 'particles'];
    if (!validEffects.includes(effect)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid effect. Must be none, rain, snow, stars, or particles',
      });
    }

    const customization = await ChatCustomization.findOneAndUpdate(
      { userId },
      { $set: { effect } },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Effect updated successfully',
      data: customization,
    });
  } catch (error) {
    console.error('Update effect error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating effect',
      error: error.message,
    });
  }
};