const jwt = require("jsonwebtoken");
const User = require("../models/user");

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  const cookie = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

async function authMiddleware(req, res, next) {
  const token = readCookie(req, "gym_session");
  if (!token) {
    return res.status(401).json({ message: "Please sign in to continue." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    const user = await User.findById(decoded.sub);
    if (!user) return res.status(401).json({ message: "Your account could not be found." });
    req.user = user;
    req.userId = user._id;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Your session has expired. Please sign in again." });
  }
}

module.exports = authMiddleware;
