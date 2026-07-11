const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("./cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "safechat_attachments",
    resource_type: "auto", // This supports raw files (pdfs, zips, docs) as well as video and image
  },
});

const attachmentUpload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
  },
});

module.exports = attachmentUpload;
