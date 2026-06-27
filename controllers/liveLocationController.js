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

        // ✅ FIX: Get sender and receiver info for the socket event
        const User = require("../models/User");
        const sender = await User.findById(senderId);
        const receiver = await User.findById(receiverId);

        // ✅ FIX: Send a properly structured object
        if (global.io) {
            global.io.to(receiverId).emit("incoming-location-request", {
                requestId: request._id.toString(),
                senderId: request.senderId.toString(),
                receiverId: request.receiverId.toString(),
                senderName: sender?.name || "User",
                receiverName: receiver?.name || "User",
                senderAvatar: sender?.picture || null,
                receiverAvatar: receiver?.picture || null,
                status: request.status,
                expiresAt: request.expiresAt,
                latitude: request.latitude,
                longitude: request.longitude,
                createdAt: request.createdAt,
                shareId: request._id.toString(),
                _id: request._id.toString()
            });
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
        const {
            requestId,
            latitude,
            longitude,
        } = req.body;

        console.log('🔍 Accepting location with requestId:', requestId);

        // ✅ FIX: Handle both string and ObjectId
        const request = await LiveLocation.findById(requestId);

        if (!request) {
            console.log('❌ Request not found for ID:', requestId);
            return res.status(404).json({
                success: false,
                message: "Request not found",
            });
        }

        request.status = "accepted";
        request.latitude = latitude;
        request.longitude = longitude;

        await request.save();

        // ✅ FIX: Get sender info for the socket event
        const User = require("../models/User");
        const sender = await User.findById(request.senderId);
        const receiver = await User.findById(request.receiverId);

        if (global.io) {
            global.io
                .to(request.senderId.toString())
                .emit("location-accepted", {
                    requestId: request._id.toString(),
                    senderId: request.senderId.toString(),
                    receiverId: request.receiverId.toString(),
                    senderName: sender?.name || "User",
                    receiverName: receiver?.name || "User",
                    senderAvatar: sender?.picture || null,
                    receiverAvatar: receiver?.picture || null,
                    status: request.status,
                    latitude: request.latitude,
                    longitude: request.longitude,
                    expiresAt: request.expiresAt,
                    shareId: request._id.toString(),
                    _id: request._id.toString()
                });
        }

        res.json({
            success: true,
            request,
        });

    } catch (err) {
        console.error('Error in acceptLocation:', err);
        res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

exports.rejectLocation = async (req, res) => {
    try {
        const { requestId } = req.body;

        console.log('🔍 Rejecting location with requestId:', requestId);

        const request = await LiveLocation.findById(requestId);

        if (!request) {
            console.log('❌ Request not found for ID:', requestId);
            return res.status(404).json({
                success: false,
                message: "Request not found",
            });
        }

        request.status = "rejected";
        await request.save();

        // ✅ FIX: Get sender info for the socket event
        const User = require("../models/User");
        const sender = await User.findById(request.senderId);
        const receiver = await User.findById(request.receiverId);

        if (global.io) {
            global.io
                .to(request.senderId.toString())
                .emit("location-rejected", {
                    requestId: request._id.toString(),
                    senderId: request.senderId.toString(),
                    receiverId: request.receiverId.toString(),
                    senderName: sender?.name || "User",
                    receiverName: receiver?.name || "User",
                    senderAvatar: sender?.picture || null,
                    receiverAvatar: receiver?.picture || null,
                    status: request.status,
                    shareId: request._id.toString(),
                    _id: request._id.toString()
                });
        }

        res.json({
            success: true,
            request,
        });

    } catch (err) {
        console.error('Error in rejectLocation:', err);
        res.status(500).json({
            success: false,
            message: err.message,
        });
    }
};

exports.stopLocation = async (req, res) => {
    try {
        const { requestId } = req.body;

        console.log('🔍 Stopping location with requestId:', requestId);

        const request = await LiveLocation.findById(requestId);

        if (!request) {
            console.log('❌ Request not found for ID:', requestId);
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
                .emit("location-stopped", {
                    requestId: request._id.toString(),
                    senderId: request.senderId.toString(),
                    receiverId: request.receiverId.toString(),
                    status: request.status,
                    shareId: request._id.toString(),
                    _id: request._id.toString()
                });
        }

        res.json({
            success: true,
            request,
        });

    } catch (err) {
        console.error('Error in stopLocation:', err);
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

