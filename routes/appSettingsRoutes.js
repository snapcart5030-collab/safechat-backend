import express from "express";
import {
  getSettings,
  updateHeaderColor,
} from "../controllers/appSettingsController.js";

const router = express.Router();

router.get("/", getSettings);
router.put("/header-color", updateHeaderColor);

export default router;