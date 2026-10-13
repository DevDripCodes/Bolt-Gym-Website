require("dotenv").config();

const express = require("express");
const connectDB = require("./config/db");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Gym Booking API is running" });
});

async function startServer() {
  await connectDB();

  app.listen(process.env.PORT || 5000, () => {
    console.log("Server running on port 5000");
  });
}
const authRoutes = require("./routes/authRoutes");

app.use(express.json());
app.use("/api/auth", authRoutes);

startServer();