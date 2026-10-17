function dateKey(date, timeZone = process.env.GYM_TIMEZONE || "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateAtGymTime(value, hour, minute, second = 0) {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const dateCheck = new Date(Date.UTC(year, month - 1, day));
  if (dateCheck.getUTCFullYear() !== year || dateCheck.getUTCMonth() + 1 !== month || dateCheck.getUTCDate() !== day) return null;

  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  let candidate = targetUtc;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: process.env.GYM_TIMEZONE || "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const values = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const representedUtc = Date.UTC(
      Number(values.year), Number(values.month) - 1, Number(values.day),
      Number(values.hour), Number(values.minute), Number(values.second)
    );
    candidate += targetUtc - representedUtc;
  }
  const values = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
  const matchesRequestedTime = Number(values.year) === year
    && Number(values.month) === month
    && Number(values.day) === day
    && Number(values.hour) === hour
    && Number(values.minute) === minute
    && Number(values.second) === second;
  return matchesRequestedTime ? new Date(candidate) : null;
}

function startOfDate(value) {
  return dateAtGymTime(value, 0, 0);
}

function endOfDate(value) {
  if (!startOfDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const following = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDay = `${following.getUTCFullYear()}-${String(following.getUTCMonth() + 1).padStart(2, "0")}-${String(following.getUTCDate()).padStart(2, "0")}`;
  const nextStart = startOfDate(nextDay);
  return nextStart ? new Date(nextStart.getTime() - 1) : null;
}

function isHalfHourSlot(date, timeZone = process.env.GYM_TIMEZONE || "Asia/Kolkata") {
  if (date.getUTCMilliseconds() !== 0) return false;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, minute: "2-digit", second: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return (values.minute === "00" || values.minute === "30") && values.second === "00";
}

module.exports = { dateAtGymTime, dateKey, endOfDate, isHalfHourSlot, parseDate, startOfDate };
