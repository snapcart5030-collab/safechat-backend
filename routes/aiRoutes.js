const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require("../models/User");

const router = express.Router();

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

router.post("/ask", async (req, res) => {
  try {

    const { question, userId } = req.body;

 const user = await User.findById(userId);

if (!user) {
  return res.status(404).json({
    answer: "User not found",
  });
}

if (!user.aiUsage) {
  user.aiUsage = {
    count: 0,
    resetAt: null,
  };
}

const now = new Date();

// 12 तास पूर्ण झाले तर reset
if (
  user.aiUsage.resetAt &&
  now > user.aiUsage.resetAt
) {
  user.aiUsage.count = 0;
  user.aiUsage.resetAt = null;
}

// Limit check
if (user.aiUsage.count >= 6) {
  return res.status(429).json({
    answer:
      "AI limit reached. Please try again after 12 hours.",
  });
}

// First question
if (!user.aiUsage.resetAt) {
  user.aiUsage.resetAt = new Date(
    now.getTime() +
      12 * 60 * 60 * 1000
  );
}

user.aiUsage.count += 1;

await user.save();

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

    res.json({
      answer: response,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      answer: "Gemini Error",
    });

  }
});

module.exports = router;