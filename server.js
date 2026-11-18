require("dotenv").config?.();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("Set JWT_SECRET to a random secret of at least 32 characters.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL to your PostgreSQL database connection string.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(20) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      referral_code VARCHAR(20) UNIQUE NOT NULL,
      referred_by VARCHAR(20),
      role VARCHAR(10) NOT NULL DEFAULT 'customer',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      items JSONB NOT NULL,
      total INTEGER NOT NULL,
      customer_name VARCHAR(100) NOT NULL,
      address TEXT NOT NULL,
      phone VARCHAR(20) NOT NULL,
      payment_method VARCHAR(30) NOT NULL DEFAULT 'Cash on Delivery',
      status VARCHAR(30) NOT NULL DEFAULT 'Pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function makeReferral() {
  return "FS" + Math.random().toString(36).slice(2, 8).toUpperCase();
}
function setToken(res, user) {
  const token = jwt.sign({ id: user.id, phone: user.phone, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("foodshop_token", token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}
function requireAuth(req, res, next) {
  try {
    const token = req.cookies.foodshop_token;
    if (!token) return res.status(401).json({ error: "আগে লগইন করুন।" });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "সেশন শেষ হয়েছে। আবার লগইন করুন।" });
  }
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  next();
}

app.post("/api/register", authLimiter, async (req, res) => {
  try {
    const { phone, password, referralCode } = req.body || {};
    if (!/^01[3-9]\d{8}$/.test(String(phone || ""))) return res.status(400).json({ error: "সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন।" });
    if (typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।" });
    let referredBy = null;
    if (referralCode) {
      const ref = await pool.query("SELECT referral_code FROM users WHERE referral_code=$1", [String(referralCode).trim().toUpperCase()]);
      if (!ref.rowCount) return res.status(400).json({ error: "Referral code পাওয়া যায়নি।" });
      referredBy = ref.rows[0].referral_code;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const role = phone === process.env.ADMIN_PHONE ? "admin" : "customer";
    let user;
    for (let i = 0; i < 3; i++) {
      try {
        const result = await pool.query(
          "INSERT INTO users(phone,password_hash,referral_code,referred_by,role) VALUES($1,$2,$3,$4,$5) RETURNING id,phone,referral_code,role",
          [phone, passwordHash, makeReferral(), referredBy, role]
        );
        user = result.rows[0]; break;
      } catch (e) {
        if (e.code === "23505" && e.constraint?.includes("phone")) return res.status(409).json({ error: "এই নম্বরে অ্যাকাউন্ট আছে। লগইন করুন।" });
        if (e.code !== "23505" || i === 2) throw e;
      }
    }
    setToken(res, user);
    res.json({ user: { phone: user.phone, referralCode: user.referral_code, role: user.role } });
  } catch (e) {
    console.error(e); res.status(500).json({ error: "রেজিস্ট্রেশন করা যায়নি। আবার চেষ্টা করুন।" });
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    const result = await pool.query("SELECT * FROM users WHERE phone=$1", [String(phone || "")]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(String(password || ""), user.password_hash))) return res.status(401).json({ error: "মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়।" });
    setToken(res, user);
    res.json({ user: { phone: user.phone, referralCode: user.referral_code, role: user.role } });
  } catch (e) { console.error(e); res.status(500).json({ error: "লগইন করা যায়নি।" }); }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("foodshop_token", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, async (req, res) => {
  const r = await pool.query("SELECT phone,referral_code,role,created_at FROM users WHERE id=$1", [req.user.id]);
  if (!r.rowCount) return res.status(401).json({ error: "Account not found." });
  res.json({ user: { phone: r.rows[0].phone, referralCode: r.rows[0].referral_code, role: r.rows[0].role, createdAt: r.rows[0].created_at } });
});

const products = [
  { id: 1, name: "Fresh Apples", category: "ফলমূল", price: 250, unit: "কেজি", image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=700" },
  { id: 2, name: "Fresh Bananas", category: "ফলমূল", price: 100, unit: "ডজন", image: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=700" },
  { id: 3, name: "Premium T-Shirt", category: "কাপড়", price: 450, unit: "টি", image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=700" },
  { id: 4, name: "Denim Jeans", category: "কাপড়", price: 850, unit: "টি", image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=700" }
];
app.get("/api/products", (req, res) => res.json(products));

app.post("/api/orders", requireAuth, async (req, res) => {
  try {
    const { items, customerName, address, phone } = req.body || {};
    if (!Array.isArray(items) || !items.length || items.length > 30) return res.status(400).json({ error: "কার্টে পণ্য যোগ করুন।" });
    if (!String(customerName || "").trim() || !String(address || "").trim() || !/^01[3-9]\d{8}$/.test(String(phone || ""))) return res.status(400).json({ error: "নাম, ঠিকানা ও সঠিক ফোন নম্বর দিন।" });
    let total = 0;
    const cleanItems = [];
    for (const item of items) {
      const product = products.find(p => p.id === Number(item.id));
      const qty = Number(item.qty);
      if (!product || !Number.isInteger(qty) || qty < 1 || qty > 50) return res.status(400).json({ error: "কার্টের পণ্যের তথ্য সঠিক নয়।" });
      total += product.price * qty;
      cleanItems.push({ id: product.id, name: product.name, price: product.price, qty });
    }
    const r = await pool.query(
      "INSERT INTO orders(user_id,items,total,customer_name,address,phone) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status,created_at",
      [req.user.id, JSON.stringify(cleanItems), total, String(customerName).trim(), String(address).trim(), String(phone)]
    );
    res.json({ order: r.rows[0], total });
  } catch (e) { console.error(e); res.status(500).json({ error: "অর্ডার নেওয়া যায়নি।" }); }
});

app.get("/api/orders", requireAuth, async (req, res) => {
  const r = req.user.role === "admin"
    ? await pool.query("SELECT id,items,total,customer_name,address,phone,status,created_at FROM orders ORDER BY created_at DESC")
    : await pool.query("SELECT id,items,total,customer_name,address,phone,status,created_at FROM orders WHERE user_id=$1 ORDER BY created_at DESC", [req.user.id]);
  res.json({ orders: r.rows });
});

app.patch("/api/orders/:id/status", requireAuth, requireAdmin, async (req, res) => {
  const allowed = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid status." });
  const r = await pool.query("UPDATE orders SET status=$1 WHERE id=$2 RETURNING id,status", [req.body.status, req.params.id]);
  if (!r.rowCount) return res.status(404).json({ error: "Order not found." });
  res.json({ order: r.rows[0] });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

initDb().then(() => app.listen(PORT, () => console.log(`Food Shop running on ${PORT}`)))
  .catch(err => { console.error("Database setup failed:", err); process.exit(1); });
