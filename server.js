require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");

const app = express();

connectDB();

app.use(
  cors({
    origin: "*",
  })
);

app.use(express.json());

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/users",
  userRoutes
);

app.use(
  "/api/messages",
  messageRoutes
);

app.get("/", (req, res) => {
  res.send("Server Running");
});

const PORT =
  process.env.PORT || 2036;

app.listen(PORT, () => {
  console.log(
    `Server Running On ${PORT}`
  );
});