const admin = require("../config/firebaseAdmin");

const sendNotification = async (
  token,
  title,
  body
) => {
  try {
    const message = {
      token,
      notification: {
        title,
        body,
      },
      webpush: {
        notification: {
          icon:
            "/pwa-192x192.png",
        },
      },
    };

    const response =
      await admin
        .messaging()
        .send(message);

    console.log(
      "Notification Sent",
      response
    );
  } catch (error) {
    console.log(
      "Notification Error",
      error
    );
  }
};

module.exports =
  sendNotification;