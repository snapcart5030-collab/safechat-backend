const mongoose = require("mongoose");

const callHistorySchema = new mongoose.Schema(
{
    callId: {
        type: String,
        required: true,
        unique: true
    },

    callerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    callType: {
        type: String,
        enum: ["voice", "video"],
        required: true
    },

    status: {
        type: String,
        enum: [
            "calling",
            "accepted",
            "rejected",
            "missed",
            "ended",
            "busy",
            "offline"
        ],
        default: "calling"
    },

    startedAt: Date,

    endedAt: Date,

    duration: {
        type: Number,
        default: 0
    }
},
{
    timestamps: true
});

module.exports = mongoose.model("CallHistory", callHistorySchema);