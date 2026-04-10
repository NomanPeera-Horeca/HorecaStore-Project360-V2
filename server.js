require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use('/api/', limiter);

// ── DATABASE INIT ─────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id        SERIAL PRIMARY KEY,
      slug      VARCHAR(200) UNIQUE NOT NULL,
      client    VARCHAR(200) NOT NULL,
      contact_name  VARCHAR(200),
      contact_email VARCHAR(200),
      cuisine_type  VARCHAR(100),
      project_type  VARCHAR(100),
      start_date    DATE,
      est_delivery  DATE,
      paid_by_client DECIMAL(14,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS items (
      id           SERIAL PRIMARY KEY,
      project_id   INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      name         VARCHAR(300) NOT NULL,
      brand        VARCHAR(200),
      supplier     VARCHAR(200),
      origin       VARCHAR(200),
      qty          INTEGER DEFAULT 1,
      cost_each    DECIMAL(14,2) DEFAULT 0,
      sell_each    DECIMAL(14,2) DEFAULT 0,
      status       VARCHAR(100) DEFAULT 'Pending Order',
      advance_type VARCHAR(50)  DEFAULT 'None',
      advance_amt  DECIMAL(14,2) DEFAULT 0,
      bol          VARCHAR(200),
      tracking     VARCHAR(200),
      eta          DATE,
      delivered_date DATE,
      received_by  VARCHAR(200),
      location     TEXT,
      notes        TEXT,
      img_emoji    VARCHAR(10) DEFAULT '📦',
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ Database ready');
}

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  if (password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    return res.json({ token, role: 'admin' });
  }
  if (password === process.env.TEAM_PASSWORD) {
    const token = jwt.sign({ role: 'team' }, process.env.JWT_SECRET, { expiresIn: '30d' });
    return res.json({ token, role: 'team' });
  }
  res.status(401).json({ error: 'Invalid password' });
});

app.get('/api/auth/me', auth, (req, res) => res.json({ role: req.user.role }));

// ── PROJECTS ──────────────────────────────────────────────────────────────────
app.get('/api/projects', auth, async (req, res) => {
  try {
    const { rows: projects } = await pool.query(
      'SELECT * FROM projects ORDER BY created_at DESC'
    );
    const result = await Promise.all(projects.map(async p => {
      const { rows: items } = await pool.query(
        'SELECT * FROM items WHERE project_id=$1 ORDER BY created_at', [p.id]
      );
      return { ...p, items };
    }));
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/projects', auth, adminOnly, async (req, res) => {
  try {
    const { client, contact_name, contact_email, cuisine_type, project_type,
            start_date, est_delivery, paid_by_client } = req.body;
    if (!client) return res.status(400).json({ error: 'Client name required' });

    const base = client.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g,'');
    const slug = `${base}-${Date.now()}`;

    const { rows } = await pool.query(
      `INSERT INTO projects
         (slug,client,contact_name,contact_email,cuisine_type,project_type,start_date,est_delivery,paid_by_client)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [slug, client, contact_name||'', contact_email||'', cuisine_type||'',
       project_type||'', start_date||null, est_delivery||null, paid_by_client||0]
    );
    res.json({ ...rows[0], items: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/projects/:id', auth, adminOnly, async (req, res) => {
  try {
    const { paid_by_client, est_delivery, start_date,
            contact_name, contact_email } = req.body;
    const { rows } = await pool.query(
      `UPDATE projects SET paid_by_client=$1, est_delivery=$2, start_date=$3,
         contact_name=$4, contact_email=$5
       WHERE id=$6 RETURNING *`,
      [paid_by_client, est_delivery||null, start_date||null,
       contact_name, contact_email, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/projects/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUBLIC PORTAL ─────────────────────────────────────────────────────────────
app.get('/api/portal/:slug', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM projects WHERE slug=$1 OR id::text=$1", [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });

    const p = rows[0];
    const { rows: items } = await pool.query(
      'SELECT * FROM items WHERE project_id=$1 ORDER BY created_at', [p.id]
    );

    // Strip cost data from public portal
    const safeItems = items.map(({ cost_each, ...rest }) => rest);
    const sell_total = items.reduce((s, i) => s + parseFloat(i.sell_each) * i.qty, 0);

    res.json({ ...p, items: safeItems, sell_total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ITEMS ─────────────────────────────────────────────────────────────────────
app.post('/api/projects/:id/items', auth, adminOnly, async (req, res) => {
  try {
    const { name, brand, supplier, origin, qty, cost_each, sell_each,
            advance_type, advance_amt, status, eta, location, notes, img_emoji } = req.body;
    if (!name) return res.status(400).json({ error: 'Item name required' });

    const { rows } = await pool.query(
      `INSERT INTO items
         (project_id,name,brand,supplier,origin,qty,cost_each,sell_each,
          advance_type,advance_amt,status,eta,location,notes,img_emoji)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [req.params.id, name, brand||'', supplier||'', origin||'',
       qty||1, cost_each||0, sell_each||0, advance_type||'None',
       advance_amt||0, status||'Pending Order', eta||null,
       location||'', notes||'', img_emoji||'📦']
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/items/:id', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const {
      status, location, bol, tracking, eta,
      advance_type, advance_amt,
      delivered_date, received_by, notes,
      cost_each, sell_each
    } = req.body;

    let q, p;
    if (isAdmin) {
      q = `UPDATE items SET status=$1,location=$2,bol=$3,tracking=$4,eta=$5,
             advance_type=$6,advance_amt=$7,delivered_date=$8,received_by=$9,
             notes=$10,cost_each=$11,sell_each=$12,updated_at=NOW()
           WHERE id=$13 RETURNING *`;
      p = [status, location, bol||null, tracking||null, eta||null,
           advance_type, advance_amt||0, delivered_date||null,
           received_by||null, notes||'', cost_each||0, sell_each||0, req.params.id];
    } else {
      q = `UPDATE items SET status=$1,location=$2,bol=$3,tracking=$4,eta=$5,
             delivered_date=$6,received_by=$7,notes=$8,updated_at=NOW()
           WHERE id=$9 RETURNING *`;
      p = [status, location, bol||null, tracking||null, eta||null,
           delivered_date||null, received_by||null, notes||'', req.params.id];
    }
    const { rows } = await pool.query(q, p);
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/items/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SERVE CLIENT PORTAL PAGE ──────────────────────────────────────────────────
app.get('/portal/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal.html'));
});

// ── CATCH-ALL SPA ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ─────────────────────────────────────────────────────────────────────
// Listen FIRST so Render detects the port, then init DB
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HorecaStore Project360 running on port ${PORT}`);
  // Init DB after server is already listening
  initDB().catch(err => {
    console.error('⚠️  DB init error (will retry on first request):', err.message);
  });
});
