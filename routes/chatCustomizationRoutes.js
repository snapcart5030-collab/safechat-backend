const express = require('express');
const router = express.Router();
const upload = require('../config/upload'); // Using your existing upload config
const chatCustomizationController = require('../controllers/chatCustomizationController');

// Save customization
router.post('/save', chatCustomizationController.saveCustomization);

// Get customization by userId
router.get('/:userId', chatCustomizationController.getCustomization);

// Update customization
router.put('/update', chatCustomizationController.updateCustomization);

// Delete customization and background image
router.delete('/delete/:userId', chatCustomizationController.deleteCustomization);

// Upload background image (using your existing upload middleware)
router.post(
  '/upload-background',
  upload.single('backgroundImage'),
  chatCustomizationController.uploadBackgroundImage
);

// Delete background image only
router.delete('/background', chatCustomizationController.deleteBackgroundImage);

// Update individual settings
router.put('/opacity', chatCustomizationController.updateOpacity);
router.put('/blur', chatCustomizationController.updateBlur);
router.put('/overlay', chatCustomizationController.updateOverlay);
router.put('/theme', chatCustomizationController.updateTheme);
router.put('/bubble-colors', chatCustomizationController.updateBubbleColors);
router.put('/font-settings', chatCustomizationController.updateFontSettings);
router.put('/effect', chatCustomizationController.updateEffect);

module.exports = router;