const LiveLocation = require("../models/LiveLocation");

// =======================
// SEND LOCATION REQUEST
// =======================
exports.requestLocation = async (req, res) => {
  try {
    const {
      senderId,
      receiverId,
      expiresAt,
    } = req.body;

    if (!senderId || !receiverId) {
      return res.status(400).json({
        success: false,
        message: "Sender and Receiver are required.",
      });
    }

    // Check if already active request exists
    const existing = await LiveLocation.findOne({
      senderId,
      receiverId,
      status: {
        $in: ["pending", "accepted"],
      },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Location request already exists.",
      });
    }

    const request = await LiveLocation.create({
      senderId,
      receiverId,
      expiresAt,
      status: "pending",
    });

    if (global.io) {
      global.io.to(receiverId).emit(
        "incoming-location-request",
        request
      );
    }

    res.status(201).json({
      success: true,
      request,
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });

  }
};

exports.acceptLocation = async (req, res) => {

  try {

    const { requestId } = req.body;

    const request =
      await LiveLocation.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    request.status = "accepted";

    await request.save();

    if (global.io) {

      global.io
        .to(request.senderId.toString())
        .emit(
          "location-accepted",
          request
        );

    }

    res.json({
      success: true,
      request,
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: err.message,
    });

  }

};

exports.rejectLocation = async (req, res) => {

  try {

    const { requestId } = req.body;

    const request =
      await LiveLocation.findById(requestId);

    if (!request) {

      return res.status(404).json({
        success: false,
        message: "Request not found",
      });

    }

    request.status = "rejected";

    await request.save();

    if (global.io) {

      global.io
        .to(request.senderId.toString())
        .emit(
          "location-rejected",
          request
        );

    }

    res.json({
      success: true,
      request,
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: err.message,
    });

  }

};

exports.stopLocation = async (req, res) => {

  try {

    const { requestId } = req.body;

    const request =
      await LiveLocation.findById(requestId);

    if (!request) {

      return res.status(404).json({
        success: false,
        message: "Request not found",
      });

    }

    request.status = "stopped";

    await request.save();

    if (global.io) {

      global.io
        .to(request.receiverId.toString())
        .emit(
          "location-stopped",
          request
        );

    }

    res.json({
      success: true,
      request,
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: err.message,
    });

  }

};


exports.getActiveLocation = async (req, res) => {

  try {

    const { senderId, receiverId } = req.params;

    const request =
      await LiveLocation.findOne({

        senderId,

        receiverId,

        status: "accepted",

      });

    res.json({
      success: true,
      request,
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: err.message,
    });

  }

};

