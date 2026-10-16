const state = {
  user: null,
  membership: null,
  slots: [],
  bookings: [],
  memberships: [],
  gym: null,
  timeZone: null,
  selectedDate: null,
  category: "yoga",
  adminSlots: [],
  adminConfig: null,
  adminDate: null,
  adminCategory: "yoga",
  view: "schedule",
  editingMembershipId: null,
  toastTimer: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "Something went wrong. Please try again.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function notify(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function formatDate(value, options = { weekday: "short", month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat(undefined, { ...options, ...(state.timeZone ? { timeZone: state.timeZone } : {}) }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", ...(state.timeZone ? { timeZone: state.timeZone } : {}) }).format(new Date(value));
}

function localDayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function setSignedIn(user, membership) {
  state.user = user;
  state.membership = membership;
  state.view = "schedule";
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#userName").textContent = user.name;
  $("#userAvatar").textContent = (user.name || "F").trim().slice(0, 1).toUpperCase();
  $("#adminNav").classList.toggle("hidden", user.role !== "admin");
  $("#todayLabel").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();
  $("#footerDate").textContent = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(new Date()).toUpperCase();
  setView("schedule");
  loadDashboard();
}

function setAuthMode(mode) {
  const registering = mode === "register";
  $$("[data-auth-tab]").forEach((button) => {
    const active = button.dataset.authTab === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("#loginForm").classList.toggle("hidden", registering);
  $("#registerForm").classList.toggle("hidden", !registering);
  $("#authHeading").textContent = registering ? "Start with you" : "Welcome back";
  $("#authSubheading").textContent = registering ? "Create an account and find your rhythm." : "Sign in to find your next session.";
}

async function loadDashboard() {
  try {
    const adminWorkspace = state.user?.role === "admin" && state.view === "admin";
  const params = new URLSearchParams();
  if (state.selectedDate) params.set("date", state.selectedDate);
  params.set("category", state.category);
  const [slotData, bookingData, profileData] = await Promise.all([
      api(`/api/slots?${params}`),
      api("/api/bookings/me"),
      api("/api/auth/me")
    ]);
    state.selectedDate = slotData.date;
    state.gym = slotData.gym;
    state.timeZone = slotData.timeZone;
    state.slots = slotData.slots || [];
    state.bookings = bookingData.bookings || [];
    state.membership = profileData.membership || null;
    $("#bookingDate").value = state.selectedDate;
    $("#bookingCategory").value = state.category;
    populateBookingTimes();
    renderMemberView();
    if (adminWorkspace) loadAdminData();
  } catch (error) {
    if (error.status === 401) return signOut(false);
    notify(error.message, true);
  }
}

function membershipIsUsable() {
  const membership = state.membership;
  const now = Date.now();
  return Boolean(membership && new Date(membership.startsAt).getTime() <= now && new Date(membership.expiresAt).getTime() > now);
}

function renderMembership() {
  const target = $("#membershipCard");
  const membership = state.membership;
  const usable = membershipIsUsable();
  if (!membership) {
    target.className = "membership-card inactive";
    target.innerHTML = '<div class="membership-top"><p class="eyebrow">YOUR MEMBERSHIP</p><span class="membership-symbol">✳</span></div><div class="membership-status"><i class="status-dot"></i> No membership</div><h3>Ready when you are.</h3><p class="membership-date">Ask the gym team about membership options.</p><div class="membership-bottom"><span>BOOKING ACCESS</span><strong>Unavailable</strong></div>';
    return;
  }
  const expiry = formatMembershipDate(membership.endDate || dateInputValue(membership.expiresAt));
  let remaining = "Expired";
  if (membership.status === "upcoming") remaining = `Starts ${formatMembershipDate(membership.startDate || dateInputValue(membership.startsAt))}`;
  else if (usable) {
    const days = Math.max(0, Math.ceil((new Date(membership.expiresAt).getTime() - Date.now()) / 86400000));
    remaining = days === 0 ? "Last day" : `${days} day${days === 1 ? "" : "s"} left`;
  }
  const status = usable ? "Active" : membership.status === "upcoming" ? "Starts soon" : "Expired";
  target.className = `membership-card${usable ? "" : " inactive"}`;
  target.innerHTML = `<div class="membership-top"><p class="eyebrow">YOUR MEMBERSHIP</p><span class="membership-symbol">✳</span></div><div class="membership-status"><i class="status-dot"></i> ${status}</div><h3>${escapeHtml(membership.plan)}</h3><p class="membership-date">${usable ? "Valid through" : membership.status === "upcoming" ? "Planned through" : "Ended"} ${escapeHtml(expiry)}</p><div class="membership-bottom"><span>BOOKING ACCESS</span><strong>${escapeHtml(remaining)}</strong></div>`;
}

function renderSchedule() {
  const target = $("#scheduleList");
  const date = state.selectedDate || "";
  $("#availabilityDay").textContent = date ? `${formatDate(dateForGymDay(date), { weekday: "long", month: "long", day: "numeric" })} · ${state.category.toUpperCase()}` : "AVAILABLE 30-MINUTE WINDOWS";
  $("#availabilityHours").textContent = state.gym ? `${displayClock(state.gym.opensAt)} – ${displayClock(state.gym.closesAt)} gym time` : "";
  if (!state.slots.length) {
    target.innerHTML = '<div class="empty-schedule"><strong>No bookable windows.</strong>The gym is closed for this date or equipment type.</div>';
    return;
  }
  const start = $("#bookingStart").value;
  const end = $("#bookingEnd").value;
  target.innerHTML = state.slots.map((slot) => {
    const selected = start && end && slot.startTime >= start && slot.startTime < end;
    const remaining = Math.max(0, Number(slot.remaining) || 0);
    const status = slot.isPast ? "Time passed" : slot.bookedByMe ? "Your booking" : remaining ? `${slot.bookedCount}/${slot.capacity} booked · ${remaining} left` : `${slot.bookedCount}/${slot.capacity} · Full`;
    return `<div class="availability-row${selected ? " selected" : ""}${remaining === 0 ? " full" : ""}${slot.isPast ? " past" : ""}"><div class="availability-time">${escapeHtml(displayClock(slot.startTime))}<span>– ${escapeHtml(displayClock(slot.endTime))}</span></div><div class="availability-count">${escapeHtml(status)}${slot.capacityOverride ? '<span class="override-tag">ADMIN ADJUSTED</span>' : ""}</div></div>`;
  }).join("");
}

function displayClock(value) {
  if (value === "24:00") return "12:00 AM";
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const shownHour = hour % 12 || 12;
  return `${shownHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function dateForGymDay(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function populateBookingTimes() {
  const startTarget = $("#bookingStart");
  const endTarget = $("#bookingEnd");
  const oldStart = startTarget.value;
  const oldEnd = endTarget.value;
  const starts = state.slots.filter((slot) => !slot.isPast).map((slot) => slot.startTime);
  const ends = [...starts, ...(state.slots.length ? [state.slots[state.slots.length - 1].endTime] : [])];
  startTarget.innerHTML = starts.map((time) => `<option value="${escapeHtml(time)}">${escapeHtml(displayClock(time))}</option>`).join("");
  endTarget.innerHTML = ends.map((time) => `<option value="${escapeHtml(time)}">${escapeHtml(displayClock(time))}</option>`).join("");
  startTarget.value = starts.includes(oldStart) ? oldStart : starts[0] || "";
  const firstEnd = ends.find((time) => time > startTarget.value) || "";
  endTarget.value = ends.includes(oldEnd) && oldEnd > startTarget.value ? oldEnd : firstEnd;
  renderBookingWindow();
}

function renderBookingWindow() {
  const start = $("#bookingStart").value;
  const end = $("#bookingEnd").value;
  const selected = state.slots.filter((slot) => start && end && slot.startTime >= start && slot.startTime < end);
  const blockCount = selected.length;
  const duration = (clockValue(end) - clockValue(start)) / 60;
  const complete = Number.isFinite(duration) && duration > 0 && duration * 2 === blockCount;
  const remaining = selected.length ? Math.min(...selected.map((slot) => slot.remaining)) : 0;
  const overlapping = state.bookings.some((booking) =>
    new Date(booking.startsAt) < (selected.at(-1)?.endsAt ? new Date(selected.at(-1).endsAt) : 0) &&
    new Date(booking.endsAt) > (selected[0]?.startsAt ? new Date(selected[0].startsAt) : 0)
  );
  const startsInPast = selected.length && new Date(selected[0].startsAt) <= new Date();
  const button = $("#bookWindowButton");
  const note = $("#bookingWindowNote");
  const access = $("#bookingAccessNote");
  if (!start || !end || !complete) note.textContent = "Choose a start and end time on the 30-minute grid.";
  else if (remaining === 0) note.textContent = "There are no equipment spaces for the full selected window.";
  else note.textContent = `${blockCount} half-hour block${blockCount === 1 ? "" : "s"} · ${remaining} space${remaining === 1 ? "" : "s"} available in every block.`;
  access.textContent = membershipIsUsable() ? "" : "An active membership is required to reserve equipment.";
  button.disabled = !membershipIsUsable() || !complete || !blockCount || remaining === 0 || overlapping || startsInPast;
  if (overlapping) note.textContent = "You already have a booking that overlaps this window.";
  renderSchedule();
}

function clockValue(value) {
  if (value === "24:00") return 1440;
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function upcomingBookings() {
  return state.bookings
    .filter((booking) => new Date(booking.startsAt) > new Date())
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}

function renderMiniBookings() {
  const bookings = upcomingBookings().slice(0, 3);
  const target = $("#upcomingBookings");
  if (!bookings.length) {
    target.innerHTML = '<p class="empty-note">No sessions booked yet. Your next good thing is on the schedule.</p>';
    return;
  }
  target.innerHTML = bookings.map((booking) => {
    const date = new Date(booking.startsAt);
    return `<div class="mini-booking"><div class="mini-date"><strong>${new Intl.DateTimeFormat(undefined, { day: "numeric", ...(state.timeZone ? { timeZone: state.timeZone } : {}) }).format(date)}</strong><span>${escapeHtml(new Intl.DateTimeFormat(undefined, { month: "short", ...(state.timeZone ? { timeZone: state.timeZone } : {}) }).format(date))}</span></div><div><p class="mini-title">${escapeHtml(booking.category)} training</p><span class="mini-meta">${escapeHtml(formatTime(booking.startsAt))}–${escapeHtml(formatTime(booking.endsAt))}</span></div></div>`;
  }).join("");
}

function renderAllBookings() {
  const target = $("#allBookings");
  const bookings = [...state.bookings].sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  if (!bookings.length) {
    target.innerHTML = '<p class="empty-note">You have no bookings yet. Choose a session from the schedule when you’re ready.</p>';
    return;
  }
  target.innerHTML = `<table class="booking-table"><thead><tr><th>Session</th><th>Style</th><th>Date &amp; time</th><th></th></tr></thead><tbody>${bookings.map((booking) => {
    const canCancel = new Date(booking.startsAt) > new Date();
    return `<tr><td>${escapeHtml(booking.category)} training · ${booking.blockCount} block${booking.blockCount === 1 ? "" : "s"}</td><td><span class="category-tag ${escapeHtml(booking.category)}">${escapeHtml(booking.category)}</span></td><td>${escapeHtml(formatDate(booking.startsAt, { weekday: "short", month: "short", day: "numeric" }))} · ${escapeHtml(formatTime(booking.startsAt))}–${escapeHtml(formatTime(booking.endsAt))}</td><td>${canCancel ? `<button class="button button-quiet button-small" type="button" data-cancel="${escapeHtml(booking._id)}">Cancel</button>` : "Completed"}</td></tr>`;
  }).join("")}</tbody></table>`;
}

function renderMemberView() {
  renderMembership();
  renderSchedule();
  renderMiniBookings();
  renderAllBookings();
}

function setView(view) {
  if (view === "admin" && state.user?.role !== "admin") view = "schedule";
  state.view = view;
  $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#memberView").classList.toggle("hidden", view === "admin");
  $("#adminView").classList.toggle("hidden", view !== "admin");
  $("#scheduleSection").classList.toggle("hidden", view === "bookings");
  $(".side-column").classList.toggle("hidden", view === "bookings");
  $("#allBookingsSection").classList.toggle("hidden", view !== "bookings");
  if (view === "admin") loadAdminData();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function dateInputValue(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatMembershipDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function localDateInputValue(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function setDefaultMembershipDates() {
  const form = $("#membershipForm");
  const start = new Date();
  const end = new Date();
  end.setMonth(end.getMonth() + 1);
  form.elements.startDate.value = localDateInputValue(start);
  form.elements.endDate.value = localDateInputValue(end);
}

function populateGymCloseTimes() {
  const target = $("#gymClosesAt");
  const previous = target.value;
  const options = [];
  for (let minute = 30; minute <= 1440; minute += 30) {
    const value = minute === 1440 ? "24:00" : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    options.push(`<option value="${value}">${escapeHtml(displayClock(value))}${value === "24:00" ? " · midnight" : ""}</option>`);
  }
  target.innerHTML = options.join("");
  target.value = previous;
}

async function loadAdminData() {
  if (state.user?.role !== "admin") return;
  try {
    const dateInput = $("#adminAvailabilityDate");
    const categoryInput = $("#adminAvailabilityCategory");
    if (!state.adminDate) state.adminDate = state.selectedDate || localDayKey(new Date());
    dateInput.value = state.adminDate;
    categoryInput.value = state.adminCategory;
    const params = new URLSearchParams({ date: state.adminDate, category: state.adminCategory });
    const [slotData, membershipData, settings, configData] = await Promise.all([
      api(`/api/admin/slots?${params}`),
      api("/api/admin/memberships"),
      api("/api/admin/settings"),
      api("/api/admin/config")
    ]);
    state.adminSlots = slotData.slots || [];
    state.adminConfig = configData.config;
    state.memberships = membershipData.memberships || [];
    $("#dailyLimit").value = settings.maxBookingsPerDay || 4;
    populateGymCloseTimes();
    $("#gymOpensAt").value = state.adminConfig.opensAt;
    $("#gymClosesAt").value = state.adminConfig.closesAt;
    $("#yogaCapacity").value = state.adminConfig.capacities.yoga;
    $("#cardioCapacity").value = state.adminConfig.capacities.cardio;
    $("#strengthCapacity").value = state.adminConfig.capacities.strength;
    $("#capacityDate").value = state.adminDate;
    $("#capacityCategory").value = state.adminCategory;
    renderAdminLists();
  } catch (error) {
    if (error.status === 401) return signOut(false);
    notify(error.message, true);
  }
}

function renderAdminLists() {
  $("#slotCount").textContent = state.adminSlots.length;
  const slotTarget = $("#adminSlots");
  slotTarget.innerHTML = state.adminSlots.length ? state.adminSlots.map((slot) => {
    const bookedCount = Number(slot.bookedCount) || 0;
    const capacity = Number(slot.capacity) || 0;
    const remaining = Math.max(0, capacity - bookedCount);
    return `<div class="admin-row"><div class="admin-row-main"><p class="admin-row-title">${escapeHtml(displayClock(slot.startTime))}–${escapeHtml(displayClock(slot.endTime))}${slot.capacityOverride ? '<span class="override-tag">OVERRIDE</span>' : ""}</p><div class="admin-row-meta">${bookedCount}/${capacity} booked · ${remaining} available</div></div><div class="admin-row-actions"><button class="mini-action" type="button" data-edit-capacity="${escapeHtml(slot.startTime)}" data-capacity="${capacity}">Adjust</button>${slot.capacityOverride ? `<button class="mini-action delete" type="button" data-reset-capacity="${escapeHtml(slot.startTime)}">Default</button>` : ""}</div></div>`;
  }).join("") : '<p class="empty-note">No intervals are available during these gym hours.</p>';

  $("#membershipCount").textContent = state.memberships.length;
  const membershipTarget = $("#adminMemberships");
  const sortedMemberships = [...state.memberships].sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt));
  membershipTarget.innerHTML = sortedMemberships.length ? sortedMemberships.map((membership) => {
    const user = membership.userId || {};
    const status = new Date(membership.expiresAt) > new Date() ? new Date(membership.startsAt) <= new Date() ? "ACTIVE" : "UPCOMING" : "EXPIRED";
    return `<div class="admin-row"><div class="admin-row-main"><p class="admin-row-title">${escapeHtml(user.name || "Member")} · ${escapeHtml(membership.plan)}</p><div class="admin-row-meta">${escapeHtml(user.email || "")} · ${status} · until ${escapeHtml(formatMembershipDate(membership.endDate || dateInputValue(membership.expiresAt)))}</div></div><div class="admin-row-actions"><button class="mini-action" type="button" data-edit-membership="${escapeHtml(membership._id)}">Edit</button><button class="mini-action delete" type="button" data-delete-membership="${escapeHtml(membership._id)}">Remove</button></div></div>`;
  }).join("") : '<p class="empty-note">No memberships yet. Add one using the member’s account email.</p>';
}

function resetMembershipForm() {
  state.editingMembershipId = null;
  $("#membershipForm").reset();
  setDefaultMembershipDates();
  $("#membershipFormHeading").textContent = "Add membership";
  $("#membershipSubmit").textContent = "Add membership";
  $("#membershipCancelEdit").classList.add("hidden");
}

function editMembership(id) {
  const membership = state.memberships.find((item) => item._id === id);
  if (!membership) return;
  state.editingMembershipId = id;
  const form = $("#membershipForm");
  form.elements.email.value = membership.userId?.email || "";
  form.elements.plan.value = membership.plan;
  form.elements.startDate.value = membership.startDate || dateInputValue(membership.startsAt);
  form.elements.endDate.value = membership.endDate || dateInputValue(membership.expiresAt);
  $("#membershipFormHeading").textContent = "Edit membership";
  $("#membershipSubmit").textContent = "Save changes";
  $("#membershipCancelEdit").classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function signOut(showMessage = true) {
  try { await api("/api/auth/logout", { method: "POST" }); } catch (_) { /* Clear the local view even if the network is unavailable. */ }
  state.user = null;
  state.membership = null;
  state.slots = [];
  state.bookings = [];
  $("#appView").classList.add("hidden");
  $("#authView").classList.remove("hidden");
  setAuthMode("login");
  if (showMessage) notify("You’re signed out.");
}

async function start() {
  $("#year").textContent = new Date().getFullYear();
  setDefaultMembershipDates();
  try {
    const result = await api("/api/auth/me");
    setSignedIn(result.user, result.membership);
  } catch (_) {
    $("#authView").classList.remove("hidden");
    $("#appView").classList.add("hidden");
  }
}

$$("[data-auth-tab]").forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authTab)));

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    const result = await api("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    setSignedIn(result.user, result.membership);
    notify(`Welcome back, ${result.user.name.split(" ")[0]}.`);
  } catch (error) { notify(error.message, true); }
  finally { submit.disabled = false; }
});

$("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    const result = await api("/api/auth/register", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset();
    setSignedIn(result.user, result.membership);
    notify(`Welcome to Bolt, ${result.user.name.split(" ")[0]}.`);
  } catch (error) { notify(error.message, true); }
  finally { submit.disabled = false; }
});

$("#logoutButton").addEventListener("click", () => signOut());

document.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) return setView(viewButton.dataset.view);
  const cancelButton = event.target.closest("[data-cancel]");
  if (cancelButton) {
    cancelButton.disabled = true;
    try {
      await api(`/api/bookings/${encodeURIComponent(cancelButton.dataset.cancel)}`, { method: "DELETE" });
      notify("Your booking has been cancelled.");
      await loadDashboard();
    } catch (error) { notify(error.message, true); cancelButton.disabled = false; }
    return;
  }
  const editCapacityButton = event.target.closest("[data-edit-capacity]");
  if (editCapacityButton) {
    $("#capacityDate").value = state.adminDate;
    $("#capacityCategory").value = state.adminCategory;
    $("#capacityStart").value = editCapacityButton.dataset.editCapacity;
    $("#capacityValue").value = editCapacityButton.dataset.capacity;
    $("#capacityForm").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const resetCapacityButton = event.target.closest("[data-reset-capacity]");
  if (resetCapacityButton) {
    try {
      await api("/api/admin/slot-capacity", {
        method: "PATCH",
        body: JSON.stringify({ date: state.adminDate, category: state.adminCategory, startTime: resetCapacityButton.dataset.resetCapacity, useDefault: true })
      });
      notify("Default interval capacity restored.");
      await loadAdminData();
    } catch (error) { notify(error.message, true); }
    return;
  }
  const editMembershipButton = event.target.closest("[data-edit-membership]");
  if (editMembershipButton) return editMembership(editMembershipButton.dataset.editMembership);
  const deleteMembershipButton = event.target.closest("[data-delete-membership]");
  if (deleteMembershipButton) {
    try {
      await api(`/api/admin/memberships/${encodeURIComponent(deleteMembershipButton.dataset.deleteMembership)}`, { method: "DELETE" });
      notify("Membership removed.");
      await loadDashboard();
    } catch (error) { notify(error.message, true); }
  }
});

$("#bookingDate").addEventListener("change", () => {
  state.selectedDate = $("#bookingDate").value;
  loadAvailability();
});

$("#bookingCategory").addEventListener("change", () => {
  state.category = $("#bookingCategory").value;
  loadAvailability();
});

$("#bookingStart").addEventListener("change", () => {
  const nextEnd = [...$("#bookingEnd").options].map((option) => option.value).find((value) => value > $("#bookingStart").value);
  if (nextEnd && $("#bookingEnd").value <= $("#bookingStart").value) $("#bookingEnd").value = nextEnd;
  renderBookingWindow();
});
$("#bookingEnd").addEventListener("change", renderBookingWindow);

$("#bookingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#bookWindowButton");
  button.disabled = true;
  const payload = {
    date: $("#bookingDate").value,
    category: $("#bookingCategory").value,
    startTime: $("#bookingStart").value,
    endTime: $("#bookingEnd").value
  };
  try {
    await api("/api/bookings", { method: "POST", body: JSON.stringify(payload) });
    notify("Your equipment time is reserved.");
    await loadDashboard();
  } catch (error) {
    notify(error.message, true);
    if (error.status === 409) await loadDashboard();
  }
  finally { renderBookingWindow(); }
});

async function loadAvailability() {
  const target = $("#scheduleList");
  target.innerHTML = '<div class="loading-state">Checking equipment availability…</div>';
  try {
    const params = new URLSearchParams({ date: state.selectedDate, category: state.category });
    const result = await api(`/api/slots?${params}`);
    state.selectedDate = result.date;
    state.gym = result.gym;
    state.timeZone = result.timeZone;
    state.slots = result.slots || [];
    $("#bookingDate").value = state.selectedDate;
    populateBookingTimes();
    renderSchedule();
  } catch (error) {
    if (error.status === 401) return signOut(false);
    target.innerHTML = '<div class="empty-schedule"><strong>Availability could not be loaded.</strong>Please try again.</div>';
    notify(error.message, true);
  }
}

$("#gymConfigForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    opensAt: form.elements.opensAt.value,
    closesAt: form.elements.closesAt.value,
    capacities: {
      yoga: Number(form.elements.yoga.value),
      cardio: Number(form.elements.cardio.value),
      strength: Number(form.elements.strength.value)
    }
  };
  try {
    await api("/api/admin/config", { method: "PATCH", body: JSON.stringify(payload) });
    notify("Gym hours and equipment capacity saved.");
    await loadAdminData();
  } catch (error) { notify(error.message, true); }
});

$("#capacityForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    date: form.elements.date.value,
    category: form.elements.category.value,
    startTime: form.elements.startTime.value,
    capacity: Number(form.elements.capacity.value),
    useDefault: false
  };
  try {
    await api("/api/admin/slot-capacity", { method: "PATCH", body: JSON.stringify(payload) });
    notify("Interval capacity updated.");
    await loadAdminData();
  } catch (error) { notify(error.message, true); }
});

$("#adminAvailabilityDate").addEventListener("change", () => {
  state.adminDate = $("#adminAvailabilityDate").value;
  $("#capacityDate").value = state.adminDate;
  loadAdminData();
});
$("#adminAvailabilityCategory").addEventListener("change", () => {
  state.adminCategory = $("#adminAvailabilityCategory").value;
  $("#capacityCategory").value = state.adminCategory;
  loadAdminData();
});
$("#resetCapacity").addEventListener("click", async () => {
  const payload = {
    date: $("#capacityDate").value,
    category: $("#capacityCategory").value,
    startTime: $("#capacityStart").value,
    useDefault: true
  };
  try {
    await api("/api/admin/slot-capacity", { method: "PATCH", body: JSON.stringify(payload) });
    notify("Default interval capacity restored.");
    await loadAdminData();
  } catch (error) { notify(error.message, true); }
});

$("#membershipForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  const path = state.editingMembershipId ? `/api/admin/memberships/${encodeURIComponent(state.editingMembershipId)}` : "/api/admin/memberships";
  try {
    await api(path, { method: state.editingMembershipId ? "PATCH" : "POST", body: JSON.stringify(payload) });
    notify(state.editingMembershipId ? "Membership updated." : "Membership added.");
    resetMembershipForm();
    await loadDashboard();
  } catch (error) { notify(error.message, true); }
});

$("#membershipCancelEdit").addEventListener("click", resetMembershipForm);

$("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = Number(new FormData(event.currentTarget).get("maxBookingsPerDay"));
  try {
    await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ maxBookingsPerDay: value }) });
    notify("Daily booking limit saved.");
  } catch (error) { notify(error.message, true); }
});

start();
