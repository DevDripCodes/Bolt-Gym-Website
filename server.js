require("dotenv").config();

const path = require("path");
const express = require("express");
const connectDB = require("./config/db");
const bootstrapAdmin = require("./config/bootstrapAdmin");
const User = require("./models/user");
const Slot = require("./models/Slot");
const Booking = require("./models/Booking");
const BookingLimit = require("./models/BookingLimit");
const Membership = require("./models/Membership");
const GymSetting = require("./models/GymSetting");
const GymConfig = require("./models/GymConfig");
const getGymConfig = require("./services/gymConfig");
const prepareBookingInventory = require("./services/bookingInventory");

const app = express();
const port = Number(process.env.PORT) || 5000;

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use(express.json({ limit: "100kb" }));
app.use((error, req, res, next) => {
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Send a valid JSON request body." });
  }
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body is too large." });
  }
  return next(error);
});
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/slots", require("./routes/slotRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

async function startServer() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be set to a random secret with at least 32 characters.");
  }
  new Intl.DateTimeFormat("en-US", { timeZone: process.env.GYM_TIMEZONE || "Asia/Kolkata" });

  await connectDB();
  // Wait for unique indexes before accepting traffic so duplicate bookings
  // remain impossible even when requests arrive at the same moment.
  await Promise.all([User.init(), Slot.init(), BookingLimit.init(), Membership.init(), GymSetting.init(), GymConfig.init()]);
  await prepareBookingInventory();
  await Booking.init();
  await getGymConfig();
  await bootstrapAdmin();

  app.listen(port, () => {
    console.log(`Gym booking app ready at http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});

module.exports = app;
