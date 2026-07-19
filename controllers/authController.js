const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID
);

exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: "Credential Missing",
      });
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const {
      sub,
      email,
      name,
      picture,
    } = payload;

    let user = await User.findOne({
      email,
    });

    if (!user) {
      user = await User.create({
        googleId: sub,
        email,
        name,
        picture,

        language: "en",
        languageSelected: false,
      });

      console.log("New User Saved");
    }

    // Set this once in the server environment to create the first administrator:
    // ADMIN_BOOTSTRAP_EMAIL=owner@example.com
    if (process.env.ADMIN_BOOTSTRAP_EMAIL && email.toLowerCase() === process.env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase() && user.role !== "admin") {
      user.role = "admin";
      user.adminRequest = { status: "approved", reviewedAt: new Date() };
      await user.save();
    }

    const token = jwt.sign(
      {
        id: user._id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.status(200).json({
      success: true,
      token,
      user,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Google Login Failed",
    });
  }
};
