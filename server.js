require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");

const app = express();

connectDB();

app.use(
  cors({
    origin: [
      "https://safeechats.web.app",
      "http://localhost:5173",
    ],
    credentials: true,
  })
);

app.use(express.json());

app.use(
  "/api/auth",
  authRoutes
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