const admin = require("firebase-admin");

try {
  const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!serviceAccountJSON) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not set");
  }
  
  const serviceAccount = JSON.parse(serviceAccountJSON);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  
  console.log("✅ Firebase Admin Connected Successfully");
} catch (error) {
  console.error("❌ Firebase Admin initialization failed:", error.message);
  console.error("Please add FIREBASE_SERVICE_ACCOUNT to your .env file");
  // Don't exit - let the server continue running
}

module.exports = admin;