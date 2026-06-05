const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");

const router = express.Router();

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

router.post("/ask", async (req, res) => {
  try {
    const { question, email } = req.body;

    const user = await User.findOne({
      email,
    });

    if (!user) {
      return res.status(404).json({
        answer: "User not found",
      });
    }

    const now = new Date();

    const diffHours =
      (now - user.lastQuestionReset) /
      (1000 * 60 * 60);

    if (diffHours >= 12) {
      user.aiQuestionCount = 0;
      user.lastQuestionReset = now;
      await user.save();
    }

    if (user.aiQuestionCount >= 6) {
      return res.status(403).json({
        answer:
          "You have used all 6 questions. Try again after 12 hours.",
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

    const response =
      result.response.text();

    user.aiQuestionCount += 1;

    await user.save();

    res.json({
      answer: response,
      remaining:
        6 - user.aiQuestionCount,
    });

  } catch (error) {
    console.log(error);

    res.status(500).json({
      answer: "Gemini Error",
    });
  }
});

module.exports = router;