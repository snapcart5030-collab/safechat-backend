const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "",
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    picture: {
      type: String,
      default: "",
    },

    googleId: {
      type: String,
      default: "",
    },

    aiQuestionCount: {
      type: Number,
      default: 0,
    },

    lastQuestionReset: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);