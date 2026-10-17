const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Membership = require("../models/Membership");
const authMiddleware = require("../middleware/authMiddleware");
const { dateKey } = require("../utils/dates");

const router = express.Router();
const COOKIE_NAME = "gym_session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function requestBody(req) {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
}

function writeSessionCookie(req, res, user) {
  const token = jwt.sign({}, process.env.JWT_SECRET, {
    subject: user._id.toString(),
    expiresIn: "7d",
    algorithm: "HS256"
  });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(COOKIE_MAX_AGE / 1000)}${secure}`
  );
}

function clearSessionCookie(req, res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

async function membershipSummary(userId) {
  const now = new Date();
  const membership = await Membership.findOne({ userId, startsAt: { $lte: now }, expiresAt: { $gt: now } })
    .sort({ expiresAt: -1 }) || await Membership.findOne({ userId, expiresAt: { $gt: now } })
    .sort({ startsAt: 1 }) || await Membership.findOne({ userId }).sort({ expiresAt: -1 });
  if (!membership) return null;
  let status = "expired";
  if (membership.startsAt <= now && membership.expiresAt > now) status = "active";
  else if (membership.startsAt > now && membership.expiresAt > now) status = "upcoming";
  return {
    id: membership._id,
    plan: membership.plan,
    startsAt: membership.startsAt,
    expiresAt: membership.expiresAt,
    startDate: dateKey(membership.startsAt),
    endDate: dateKey(membership.expiresAt),
    status
  };
}

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = requestBody(req);
    if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Name, email and password are required." });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName || cleanName.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ message: "Enter a valid name and email." });
    }
    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Password must be at least 8 characters and no more than 72 bytes." });
    }

    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      password: await bcrypt.hash(password, 12)
    });
    writeSessionCookie(req, res, user);
    return res.status(201).json({ user: publicUser(user), membership: null });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "An account with this email already exists." });
    console.error("Registration error:", error.message);
    return res.status(500).json({ message: "We could not create your account. Please try again." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = requestBody(req);
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password");
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    writeSessionCookie(req, res, user);
    return res.json({ user: publicUser(user), membership: await membershipSummary(user._id) });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ message: "We could not sign you in. Please try again." });
  }
});

router.post("/logout", (req, res) => {
  clearSessionCookie(req, res);
  return res.json({ message: "Signed out." });
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    return res.json({ user: publicUser(req.user), membership: await membershipSummary(req.userId) });
  } catch (error) {
    console.error("Get profile error:", error.message);
    return res.status(500).json({ message: "We could not load your account." });
  }
});

module.exports = router;
