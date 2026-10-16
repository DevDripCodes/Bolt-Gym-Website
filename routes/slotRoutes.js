const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const getGymConfig = require("../services/gymConfig");
const { dateKey, dateAtGymTime } = require("../utils/dates");
const { CATEGORIES } = require("../utils/timeSlots");
const listSlots = require("../utils/listSlots");

const router = express.Router();
router.use(authMiddleware);

function readAvailabilityQuery(req) {
  const dayKey = req.query.date || dateKey(new Date());
  const category = typeof req.query.category === "string" ? req.query.category.toLowerCase() : "yoga";
  if (!dateAtGymTime(dayKey, 0, 0)) return { error: "Choose a valid date." };
  if (!CATEGORIES.includes(category)) return { error: "Choose yoga, cardio or strength training." };
  return { dayKey, category };
}

router.get("/", async (req, res) => {
  const query = readAvailabilityQuery(req);
  if (query.error) return res.status(400).json({ message: query.error });
  try {
    const config = await getGymConfig();
    const slots = await listSlots({ ...query, userId: req.userId, config });
    return res.json({
      date: query.dayKey,
      category: query.category,
      timeZone: process.env.GYM_TIMEZONE || "Asia/Kolkata",
      gym: { opensAt: config.opensAt, closesAt: config.closesAt, capacities: config.capacities },
      slots
    });
  } catch (error) {
    console.error("Load equipment availability error:", error.message);
    return res.status(500).json({ message: "We could not load equipment availability." });
  }
});

module.exports = router;
