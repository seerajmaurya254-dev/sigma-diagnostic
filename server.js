
require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const Razorpay = require('razorpay');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, 'data', 'db.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

fs.mkdirSync(path.dirname(DB), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 100 }));

const sessions = new Map();

const qrStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp'
    }[file.mimetype];

    cb(null, 'upi-qr' + ext);
  }
});

const qrUpload = multer({
  storage: qrStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('केवल PNG, JPG या WebP image अपलोड करें।'));
    }

    cb(null, true);
  }
});

function readDB() {
  const db = JSON.parse(fs.readFileSync(DB, 'utf8'));

  if (!db.settings || typeof db.settings !== 'object') {
    db.settings = {};
  }

  if (!Array.isArray(db.tests)) db.tests = [];
  if (!Array.isArray(db.bookings)) db.bookings = [];

  return db;
}

function writeDB(db) {
  fs.writeFileSync(DB, JSON.stringify(db, null, 2));
}

function admin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Admin login required' });
  }

  next();
}

function razorpay() {
  if (
    !process.env.RAZORPAY_KEY_ID ||
    !process.env.RAZORPAY_KEY_SECRET ||
    process.env.RAZORPAY_KEY_ID.includes('your_key')
  ) {
    return null;
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

function removeOldQr() {
  for (const ext of ['.png', '.jpg', '.webp']) {
    const file = path.join(UPLOAD_DIR, 'upi-qr' + ext);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

app.get('/api/public', (req, res) => {
  try {
    const db = readDB();

    res.json({
      settings: {
        ...db.settings,
        gatewayEnabled:
          db.settings.razorpayEnabled === true && !!razorpay()
      },
      tests: db.tests.filter(t => t.active)
    });
  } catch (e) {
    res.status(500).json({
      error: 'वेबसाइट का डेटा लोड नहीं हो सका'
    });
  }
});

app.post('/api/admin/login', (req, res) => {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({
      error: 'पहले .env में ADMIN_PASSWORD सेट करें'
    });
  }

  const supplied = Buffer.from(
    String(req.body.password || '').padEnd(256, ' ').slice(0, 256)
  );

  const expected = Buffer.from(
    String(process.env.ADMIN_PASSWORD).padEnd(256, ' ').slice(0, 256)
  );

  if (
    !req.body.password ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    return res.status(401).json({ error: 'पासवर्ड गलत है' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, true);

  res.json({ token });
});

app.post('/api/admin/logout', admin, (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/data', admin, (req, res) => {
  try {
    res.json(readDB());
  } catch (e) {
    res.status(500).json({ error: 'Admin डेटा लोड नहीं हो सका' });
  }
});

/* QR upload: admin login जरूरी */
app.post('/api/admin/upi-qr', admin, (req, res) => {
  qrUpload.single('qr')(req, res, err => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'QR image 2 MB से छोटी होनी चाहिए।'
          : err.message || 'QR upload नहीं हो सका।';

      return res.status(400).json({ error: message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'QR image चुनकर अपलोड करें।'
        });
      }

      const db = readDB();

      // पुरानी QR image को नई image से बदलें।
      for (const ext of ['.png', '.jpg', '.webp']) {
        const oldFile = path.join(UPLOAD_DIR, 'upi-qr' + ext);

        if (oldFile !== req.file.path && fs.existsSync(oldFile)) {
          fs.unlinkSync(oldFile);
        }
      }

      db.settings.upiQrImage = '/uploads/' + req.file.filename;
      db.settings.upiQrEnabled = true;

      writeDB(db);

      res.json({
        ok: true,
        qrImage: db.settings.upiQrImage,
        message: 'QR upload हो गया।'
      });
    } catch (e) {
      res.status(500).json({ error: 'QR सेव नहीं हो सका।' });
    }
  });
});

/* QR delete: admin login जरूरी */
app.delete('/api/admin/upi-qr', admin, (req, res) => {
  try {
    const db = readDB();

    removeOldQr();
    db.settings.upiQrImage = '';
    db.settings.upiQrEnabled = false;

    writeDB(db);

    res.json({
      ok: true,
      message: 'QR हटा दिया गया।'
    });
  } catch (e) {
    res.status(500).json({ error: 'QR हटाया नहीं जा सका।' });
  }
});

app.put('/api/admin/settings', admin, (req, res) => {
  try {
    const db = readDB();
    const s = req.body || {};

    const allowed = [
      'labName',
      'tagline',
      'phone',
      'address',
      'bookingFee',
      'homeCollectionFee',
      'logoText',
      'accent',
      'upiId',
      'upiEnabled',
      'upiIntentEnabled',
      'upiQrEnabled',
      'razorpayEnabled'
    ];

    for (const k of allowed) {
      if (s[k] === undefined) continue;

      if (['bookingFee', 'homeCollectionFee'].includes(k)) {
        db.settings[k] = Math.max(0, Number(s[k]) || 0);
      } else if (
        ['upiEnabled', 'upiIntentEnabled', 'upiQrEnabled', 'razorpayEnabled'].includes(k)
      ) {
        db.settings[k] = s[k] === true;
      } else {
        db.settings[k] = String(s[k] ?? '').slice(0, 500);
      }
    }

    // Razorpay केवल keys configure होने पर और explicitly enabled होने पर चलेगा।
    if (db.settings.razorpayEnabled !== true) {
      db.settings.razorpayEnabled = false;
    }

    writeDB(db);
    res.json({ settings: db.settings });
  } catch (e) {
    res.status(500).json({ error: 'सेटिंग्स सेव नहीं हो सकीं' });
  }
});

app.post('/api/admin/tests', admin, (req, res) => {
  try {
    const db = readDB();
    const t = req.body || {};

    if (
      !t.name ||
      !Number.isFinite(Number(t.price)) ||
      Number(t.price) < 0
    ) {
      return res.status(400).json({
        error: 'टेस्ट का नाम और सही कीमत भरें'
      });
    }

    const item = {
      id: t.id || crypto.randomUUID(),
      name: String(t.name).slice(0, 120),
      category: String(t.category || 'Other').slice(0, 80),
      price: Number(t.price),
      description: String(t.description || '').slice(0, 300),
      active: t.active !== false
    };

    const i = db.tests.findIndex(x => x.id === item.id);

    if (i >= 0) db.tests[i] = item;
    else db.tests.push(item);

    writeDB(db);
    res.json({ test: item });
  } catch (e) {
    res.status(500).json({ error: 'टेस्ट सेव नहीं हो सका' });
  }
});

app.delete('/api/admin/tests/:id', admin, (req, res) => {
  try {
    const db = readDB();
    db.tests = db.tests.filter(t => t.id !== req.params.id);

    writeDB(db);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'टेस्ट हटाया नहीं जा सका' });
  }
});

app.patch('/api/admin/bookings/:id', admin, (req, res) => {
  try {
    const db = readDB();
    const b = db.bookings.find(x => x.id === req.params.id);

    if (!b) {
      return res.status(404).json({ error: 'बुकिंग नहीं मिली' });
    }

    const allowedStatuses = [
      'Confirmed',
      'Sample Collected',
      'Completed',
      'Cancelled',
      'WhatsApp Pending',
      'Payment Pending'
    ];

    if (allowedStatuses.includes(req.body.status)) {
      b.status = req.body.status;
    }

    writeDB(db);
    res.json({ booking: b });
  } catch (e) {
    res.status(500).json({
      error: 'बुकिंग की स्थिति सेव नहीं हुई'
    });
  }
});

function buildBooking(body, db) {
  if (
    !body.name ||
    !body.phone ||
    !Array.isArray(body.testIds) ||
    !body.testIds.length
  ) {
    throw new Error('नाम, मोबाइल नंबर और कम से कम एक टेस्ट जरूरी है');
  }

  const phone = String(body.phone).replace(/\D/g, '');

  if (phone.length < 10 || phone.length > 13) {
    throw new Error('सही मोबाइल नंबर भरें');
  }

  const tests = body.testIds.map(id =>
    db.tests.find(t => t.id === id && t.active)
  );

  if (tests.some(t => !t)) {
    throw new Error('किसी टेस्ट की जानकारी बदल गई है; पेज रीफ्रेश करें');
  }

  const collection = body.collection === 'home' ? 'home' : 'lab';
  const subtotal = tests.reduce((n, t) => n + Number(t.price), 0);
  const bookingFee = Number(db.settings.bookingFee) || 0;
  const collectionFee =
    collection === 'home'
      ? Number(db.settings.homeCollectionFee) || 0
      : 0;

  return {
    id: 'SD' + Date.now().toString().slice(-8) +
      crypto.randomBytes(2).toString('hex').toUpperCase(),
    name: String(body.name).slice(0, 100),
    phone,
    address: String(body.address || '').slice(0, 400),
    date: String(body.date || '').slice(0, 20),
    time: String(body.time || '').slice(0, 30),
    collection,
    tests: tests.map(t => ({
      id: t.id,
      name: t.name,
      price: Number(t.price)
    })),
    subtotal,
    bookingFee,
    collectionFee,
    total: subtotal + bookingFee + collectionFee,
    status: 'Payment Pending',
    paymentStatus: 'Pending',
    createdAt: new Date().toISOString()
  };
}

app.post('/api/whatsapp-booking', (req, res) => {
  try {
    const db = readDB();
    const booking = buildBooking(req.body || {}, db);

    booking.status = 'WhatsApp Pending';
    booking.paymentStatus = 'Pay at lab';

    db.bookings.push(booking);
    writeDB(db);

    res.json({
      ok: true,
      bookingId: booking.id,
      booking,
      labName: db.settings.labName,
      whatsapp: db.settings.phone || ''
    });
  } catch (e) {
    res.status(400).json({
      error: e.message || 'बुकिंग सेव नहीं हो सकी'
    });
  }
});

app.post('/api/checkout', async (req, res) => {
  try {
    const db = readDB();
    const booking = buildBooking(req.body || {}, db);
    const rp = razorpay();

    if (db.settings.razorpayEnabled !== true || !rp) {
      return res.status(503).json({
        error: 'Razorpay अभी बंद है।'
      });
    }

    const order = await rp.orders.create({
      amount: Math.round(booking.total * 100),
      currency: 'INR',
      receipt: booking.id,
      notes: {
        bookingId: booking.id,
        lab: db.settings.labName
      }
    });

    booking.orderId = order.id;
    db.bookings.push(booking);
    writeDB(db);

    res.json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      bookingId: booking.id,
      labName: db.settings.labName,
      customerName: booking.name,
      customerPhone: booking.phone
    });
  } catch (e) {
    res.status(400).json({
      error: e.message || 'Checkout शुरू नहीं हो सका'
    });
  }
});

app.post('/api/payment/verify', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body || {};

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !process.env.RAZORPAY_KEY_SECRET
    ) {
      return res.status(400).json({
        error: 'पेमेंट की जानकारी अधूरी है'
      });
    }

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(String(razorpay_signature));

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      return res.status(400).json({
        error: 'पेमेंट सिग्नेचर की पुष्टि नहीं हुई'
      });
    }

    const db = readDB();
    const b = db.bookings.find(x => x.orderId === razorpay_order_id);

    if (!b) {
      return res.status(404).json({ error: 'बुकिंग नहीं मिली' });
    }

    b.paymentId = razorpay_payment_id;
    b.paymentStatus = 'Paid';
    b.status = 'Confirmed';
    b.paidAt = new Date().toISOString();

    writeDB(db);

    res.json({
      ok: true,
      bookingId: b.id,
      status: b.status
    });
  } catch (e) {
    res.status(500).json({
      error: 'पेमेंट सत्यापित नहीं हो सका'
    });
  }
});

app.get('/api/booking/:id', (req, res) => {
  try {
    const db = readDB();
    const b = db.bookings.find(x => x.id === req.params.id);

    if (!b) {
      return res.status(404).json({ error: 'बुकिंग नहीं मिली' });
    }

    res.json({
      id: b.id,
      name: b.name,
      tests: b.tests,
      total: b.total,
      status: b.status,
      paymentStatus: b.paymentStatus,
      collection: b.collection,
      date: b.date
    });
  } catch (e) {
    res.status(500).json({
      error: 'बुकिंग की जानकारी नहीं मिल सकी'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Sigma Diagnostic running on port ${PORT}`);
});
