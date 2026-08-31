const express = require('express');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const PICKUP_WINDOW_MINUTES = 40;

// ---- Menu ----
router.get('/menu', requireAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM menu_items WHERE available = 1 ORDER BY category, id').all();
  res.json({ items });
});

// ---- Staff: menu management ----
router.get('/staff/menu', requireAuth, requireRole('staff', 'admin'), (req, res) => {
  // Includes sold-out items so staff can restock and edit them.
  const items = db.prepare('SELECT * FROM menu_items ORDER BY category, id').all();
  res.json({ items });
});

router.post('/staff/menu', requireAuth, requireRole('staff', 'admin'), (req, res) => {
  const { name, price, category, stockQuantity } = req.body;
  const validCategories = ['Food & Meals', 'Snacks & Beverages'];
  const numericPrice = Number(price);
  const stock = stockQuantity === '' || stockQuantity === null || stockQuantity === undefined
    ? null : Number(stockQuantity);

  if (!name?.trim() || !Number.isFinite(numericPrice) || numericPrice < 0 || !validCategories.includes(category)) {
    return res.status(400).json({ error: 'Name, valid price, and category are required' });
  }
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
    return res.status(400).json({ error: 'Stock quantity must be a whole number of 0 or more' });
  }

  const result = db.prepare(
    'INSERT INTO menu_items (name, price, category, stock_quantity, available) VALUES (?, ?, ?, ?, ?)'
  ).run(name.trim(), numericPrice, category, stock, stock === 0 ? 0 : 1);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/staff/menu/:id', requireAuth, requireRole('staff', 'admin'), (req, res) => {
  const { name, price, category, stockQuantity } = req.body;
  const validCategories = ['Food & Meals', 'Snacks & Beverages'];
  const numericPrice = Number(price);
  const stock = stockQuantity === '' || stockQuantity === null || stockQuantity === undefined
    ? null : Number(stockQuantity);

  if (!name?.trim() || !Number.isFinite(numericPrice) || numericPrice < 0 || !validCategories.includes(category)) {
    return res.status(400).json({ error: 'Name, valid price, and category are required' });
  }
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
    return res.status(400).json({ error: 'Stock quantity must be a whole number of 0 or more' });
  }

  const result = db.prepare(
    'UPDATE menu_items SET name = ?, price = ?, category = ?, stock_quantity = ?, available = ? WHERE id = ?'
  ).run(name.trim(), numericPrice, category, stock, stock === 0 ? 0 : 1, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Menu item not found' });
  res.json({ ok: true });
});

// ---- Create order (status: pending, not paid yet) ----
router.post('/orders', requireAuth, (req, res) => {
  const { items } = req.body; // [{ menuItemId, qty }]
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' });
  }

  let total = 0;
  const resolvedItems = [];
  for (const it of items) {
    const menuItem = db
      .prepare('SELECT * FROM menu_items WHERE id = ? AND available = 1')
      .get(it.menuItemId);
    if (!menuItem) {
      return res.status(400).json({ error: `Menu item ${it.menuItemId} not available` });
    }
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    if (menuItem.stock_quantity !== null && qty > menuItem.stock_quantity) {
      return res.status(400).json({ error: `Only ${menuItem.stock_quantity} ${menuItem.name} remaining` });
    }
    total += menuItem.price * qty;
    resolvedItems.push({ menuItemId: menuItem.id, qty, priceEach: menuItem.price });
  }

  const orderResult = db
    .prepare('INSERT INTO orders (user_id, total, status) VALUES (?, ?, ?)')
    .run(req.user.id, total, 'pending');
  const orderId = orderResult.lastInsertRowid;

  const insertItem = db.prepare(
    'INSERT INTO order_items (order_id, menu_item_id, qty, price_each) VALUES (?, ?, ?, ?)'
  );
  for (const ri of resolvedItems) {
    insertItem.run(orderId, ri.menuItemId, ri.qty, ri.priceEach);
    if (db.prepare('SELECT stock_quantity FROM menu_items WHERE id = ?').get(ri.menuItemId).stock_quantity !== null) {
      db.prepare(
        'UPDATE menu_items SET stock_quantity = stock_quantity - ?, available = CASE WHEN stock_quantity - ? <= 0 THEN 0 ELSE 1 END WHERE id = ?'
      ).run(ri.qty, ri.qty, ri.menuItemId);
    }
  }

  res.json({ orderId, total, status: 'pending' });
});

// ---- Mock payment ----
// In a real system this would verify a payment gateway webhook/signature.
// Here we simulate success and issue a signed, single-use, time-boxed QR token.
router.post('/orders/:id/pay', requireAuth, (req, res) => {
  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'pending') {
    return res.status(400).json({ error: `Order already ${order.status}` });
  }

  // Simulated mock payment - always "succeeds" for demo purposes.
  const expiresAt = new Date(Date.now() + PICKUP_WINDOW_MINUTES * 60 * 1000);

  // jti = unique token id, stored so a token can be checked/invalidated server-side
  // even if a signed JWT were somehow replayed before expiry.
  const jti = crypto.randomUUID();
  const qrToken = jwt.sign(
    { orderId: order.id, jti },
    process.env.QR_SECRET,
    { expiresIn: `${PICKUP_WINDOW_MINUTES}m` }
  );

  db.prepare(
    `UPDATE orders SET status = 'paid', qr_token = ?, paid_at = datetime('now'), expires_at = ? WHERE id = ?`
  ).run(jti, expiresAt.toISOString(), order.id);

  res.json({ orderId: order.id, status: 'paid', qrToken, expiresAt: expiresAt.toISOString() });
});

// ---- Get QR image (PNG data URL) for a paid order, owned by the logged-in user ----
router.get('/orders/:id/qr', requireAuth, async (req, res) => {
  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'paid') {
    return res.status(400).json({ error: 'QR only available for paid orders' });
  }

  // Re-issue the same signed token bound to this order for display.
  const qrToken = jwt.sign(
    { orderId: order.id, jti: order.qr_token },
    process.env.QR_SECRET,
    { expiresIn: `${PICKUP_WINDOW_MINUTES}m` }
  );

  const dataUrl = await QRCode.toDataURL(qrToken);
  res.json({ dataUrl, expiresAt: order.expires_at });
});

// ---- Order status (for polling the checkout/QR page) ----
router.get('/orders/:id', requireAuth, (req, res) => {
  const order = db
    .prepare('SELECT id, status, total, created_at, expires_at, picked_up_at FROM orders WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order });
});

// ---- Staff: view the canteen order queue ----
// Kept separate from the student order endpoint so students can never see
// other students' orders.
router.get('/staff/orders', requireAuth, requireRole('staff', 'admin'), (req, res) => {
  const orders = db.prepare(
    `SELECT o.id, o.total, o.status, o.created_at, o.paid_at, o.expires_at, o.picked_up_at,
            u.name AS student_name, u.email AS student_email
     FROM orders o
     JOIN users u ON u.id = o.user_id
     ORDER BY o.id DESC`
  ).all();

  const getItems = db.prepare(
    `SELECT mi.name, oi.qty, oi.price_each
     FROM order_items oi
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE oi.order_id = ?`
  );

  res.json({
    orders: orders.map(order => ({ ...order, items: getItems.all(order.id) }))
  });
});

// ---- Staff: verify & redeem a scanned QR token ----
// This is the security-critical endpoint: signature check, expiry check,
// single-use check (rejects replay of an already-redeemed code).
router.post('/verify', requireAuth, requireRole('staff', 'admin'), (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.QR_SECRET);
  } catch (err) {
    const reason = err.name === 'TokenExpiredError' ? 'expired' : 'invalid_signature';
    return res.status(400).json({ error: 'Invalid or expired QR code', reason });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payload.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.status === 'picked_up') {
    return res.status(409).json({ error: 'This code was already redeemed', reason: 'replay' });
  }
  if (order.status !== 'paid') {
    return res.status(400).json({ error: `Order is ${order.status}, not ready for pickup` });
  }
  // jti mismatch would mean a stale/forged token for this order id
  if (order.qr_token !== payload.jti) {
    return res.status(400).json({ error: 'Token does not match this order', reason: 'jti_mismatch' });
  }

  db.prepare(`UPDATE orders SET status = 'picked_up', picked_up_at = datetime('now') WHERE id = ?`).run(order.id);

  const items = db
    .prepare(
      `SELECT mi.name, oi.qty, oi.price_each
       FROM order_items oi JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id = ?`
    )
    .all(order.id);

  const student = db.prepare('SELECT name, email FROM users WHERE id = ?').get(order.user_id);

  res.json({
    status: 'redeemed',
    orderId: order.id,
    student,
    items,
    total: order.total
  });
});

module.exports = router;
