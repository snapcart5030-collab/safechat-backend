const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

const User = require("../models/User");

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

router.post(
  "/ask",
  authMiddleware,
  async (req, res) => {
    try {
      const { question } = req.body;

      const user = req.user;

      const now = new Date();

      // First time
      if (!user.aiResetTime) {
        user.aiResetTime = new Date(
          now.getTime() +
            12 * 60 * 60 * 1000
        );
      }

      // Reset after 12 hours
      if (now > user.aiResetTime) {
        user.aiQuestionCount = 0;

        user.aiResetTime = new Date(
          now.getTime() +
            12 * 60 * 60 * 1000
        );
      }

      // Block after 7 questions
      if (user.aiQuestionCount >= 7) {
        return res.status(403).json({
          message:
            "Question limit reached. Try again after 12 hours.",
          remainingQuestions: 0,
        });
      }

      const nextQuestionNumber =
        user.aiQuestionCount + 1;

      let maxChars = 250;

      if (
        nextQuestionNumber >= 4 &&
        nextQuestionNumber <= 6
      ) {
        maxChars = 300;
      }

      if (nextQuestionNumber === 7) {
        maxChars = 800;
      }

      if (
        question.length > maxChars
      ) {
        return res.status(400).json({
          message: `Question ${nextQuestionNumber} allows only ${maxChars} characters.`,
          maxChars,
        });
      }

      const model =
        genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
        });

      const result =
        await model.generateContent(
          question
        );

      const answer =
        result.response.text();

      user.aiQuestionCount += 1;

      await user.save();

      res.json({
        answer,
        usedQuestions:
          user.aiQuestionCount,
        remainingQuestions:
          7 - user.aiQuestionCount,
        maxChars,
        resetTime:
          user.aiResetTime,
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        message: "Gemini Error",
      });
    }
  }
);

module.exports = router;