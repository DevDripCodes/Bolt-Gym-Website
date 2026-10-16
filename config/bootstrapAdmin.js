const bcrypt = require("bcrypt");
const User = require("../models/user");

async function bootstrapAdmin() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!email && !password) {
    console.warn("Admin account not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD to enable admin access.");
    return;
  }

  if (!email || !password || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Configure both ADMIN_EMAIL and ADMIN_PASSWORD; the password must be 8–72 bytes.");
  }

  let admin = await User.findOne({ email });
  if (!admin) {
    admin = await User.create({
      name: (process.env.ADMIN_NAME || "Gym Admin").trim(),
      email,
      password: await bcrypt.hash(password, 12),
      role: "admin"
    });
    console.log(`Admin account created for ${email}`);
  } else if (admin.role !== "admin") {
    admin.role = "admin";
    await admin.save();
    console.log(`Admin role enabled for ${email}`);
  }
}

module.exports = bootstrapAdmin;
