const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
    message: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: { type: String, default: "" },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);
