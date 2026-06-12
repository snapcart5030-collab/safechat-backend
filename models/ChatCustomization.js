const mongoose = require('mongoose');

const chatCustomizationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  backgroundImage: {
    url: {
      type: String,
      default: null,
    },
    publicId: {
      type: String,
      default: null,
    },
  },
  opacity: {
    type: Number,
    default: 1,
    min: 0,
    max: 1,
  },
  blur: {
    type: Number,
    default: 0,
    min: 0,
    max: 20,
  },
  overlay: {
    type: Number,
    default: 0,
    min: 0,
    max: 1,
  },
  theme: {
    type: String,
    enum: ['light', 'dark', 'amoled'],
    default: 'light',
  },
  senderBubbleColor: {
    type: String,
    default: '#0084ff',
    match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  },
  receiverBubbleColor: {
    type: String,
    default: '#e4e6eb',
    match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  },
  fontSize: {
    type: Number,
    default: 14,
    min: 10,
    max: 24,
  },
  fontFamily: {
    type: String,
    default: 'system-ui',
    enum: [
      'system-ui',
      'Arial',
      'Helvetica',
      'Roboto',
      'Open Sans',
      'Lato',
      'Montserrat',
      'Poppins',
      'Nunito',
      'Inter',
    ],
  },
  effect: {
    type: String,
    enum: ['none', 'rain', 'snow', 'stars', 'particles'],
    default: 'none',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

chatCustomizationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

chatCustomizationSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

module.exports = mongoose.model('ChatCustomization', chatCustomizationSchema);