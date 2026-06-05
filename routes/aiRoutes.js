const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const router = express.Router();

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

router.post("/ask", async (req, res) => {
  try {

    const { question } = req.body;

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