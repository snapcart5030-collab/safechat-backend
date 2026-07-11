const resolvePeerSocketId = ({ socketId, call, fallbackSocketId }) => {
  if (fallbackSocketId) {
    return fallbackSocketId;
  }

  if (!call) {
    return null;
  }

  if (socketId === call.callerSocketId) {
    return call.receiverSocketId;
  }

  if (socketId === call.receiverSocketId) {
    return call.callerSocketId;
  }

  return call.callerSocketId || call.receiverSocketId || null;
};

module.exports = {
  resolvePeerSocketId,
};
