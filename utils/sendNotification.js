const admin = require("../config/firebaseAdmin");

const sendNotification = async (
  token,
  title,
  body
) => {
   console.log("FCM FUNCTION CALLED");
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
  console.log("FCM SENT SUCCESS:", response);
  } catch (error) {
    console.log(
      "Notification Error",
      error
    );
  }
};

module.exports =
  sendNotification;