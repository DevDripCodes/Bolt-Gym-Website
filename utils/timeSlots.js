const { dateAtGymTime, dateKey } = require("./dates");

const CATEGORIES = ["yoga", "cardio", "strength"];

function clockMinutes(value, allowMidnight = false) {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(00|30)$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour === 24 && minute === 0 && allowMidnight) return 24 * 60;
  if (hour > 23) return null;
  return hour * 60 + minute;
}

function clockString(minutes) {
  if (minutes === 1440) return "24:00";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function shiftDay(dayKey, amount) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey || "");
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function dateAtMinutes(dayKey, minutes) {
  if (minutes === 1440) {
    const nextDay = shiftDay(dayKey, 1);
    return nextDay ? dateAtGymTime(nextDay, 0, 0) : null;
  }
  return dateAtGymTime(dayKey, Math.floor(minutes / 60), minutes % 60);
}

function buildIntervals(dayKey, opensAt, closesAt) {
  const open = clockMinutes(opensAt);
  const close = clockMinutes(closesAt, true);
  if (open === null || close === null || open >= close) return [];
  const intervals = [];
  for (let minute = open; minute < close; minute += 30) {
    const startsAt = dateAtMinutes(dayKey, minute);
    const endsAt = dateAtMinutes(dayKey, minute + 30);
    if (!startsAt || !endsAt) continue;
    intervals.push({
      startsAt,
      endsAt,
      startTime: clockString(minute),
      endTime: clockString(minute + 30)
    });
  }
  return intervals;
}

function parseBookingRange(dayKey, startTime, endTime, config) {
  const open = clockMinutes(config.opensAt);
  const close = clockMinutes(config.closesAt, true);
  const start = clockMinutes(startTime);
  const end = clockMinutes(endTime, true);
  if (!dateAtGymTime(dayKey, 0, 0) || start === null || end === null || open === null || close === null) return null;
  if (start < open || end > close || start >= end) return null;
  const startsAt = dateAtMinutes(dayKey, start);
  const endsAt = dateAtMinutes(dayKey, end);
  if (!startsAt || !endsAt || startsAt >= endsAt) return null;
  if (dateKey(new Date(endsAt.getTime() - 1)) !== dayKey) return null;
  const intervals = [];
  for (let minute = start; minute < end; minute += 30) {
    const intervalStartsAt = dateAtMinutes(dayKey, minute);
    const intervalEndsAt = dateAtMinutes(dayKey, minute + 30);
    if (!intervalStartsAt || !intervalEndsAt) return null;
    intervals.push({
      startsAt: intervalStartsAt,
      endsAt: intervalEndsAt,
      startTime: clockString(minute),
      endTime: clockString(minute + 30)
    });
  }
  return { startsAt, endsAt, intervals, dayKey };
}

module.exports = { CATEGORIES, buildIntervals, clockMinutes, clockString, dateAtMinutes, parseBookingRange, shiftDay };
