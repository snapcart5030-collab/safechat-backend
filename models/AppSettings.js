import mongoose from "mongoose";

const appSettingsSchema = new mongoose.Schema(
  {
    headerColor: {
      type: String,
      default: "#8B1FF8",
    },
  },
  { timestamps: true }
);

export default mongoose.model("AppSettings", appSettingsSchema);