require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { rateLimit } = require('express-rate-limit');
const { randomBytes, timingSafeEqual } = require('crypto');

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campus_found';
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
const sessionCookieName = 'campusfound.sid';

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be configured in production.');
}

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  name: sessionCookieName,
  secret: sessionSecret,
  store: MongoStore.create({ mongoUrl: mongoUri, collectionName: 'sessions', ttl: 8 * 60 * 60 }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' }
});

function credentialsMatch(value, expected) {
  if (!expected) return false;
  const actualBuffer = Buffer.from(String(value || ''));
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  res.status(401).json({ error: 'Admin sign-in required.' });
}

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: Boolean(req.session?.isAdmin) });
});

app.post('/api/admin/login', adminLoginLimiter, (req, res, next) => {
  if (!adminUsername || !adminPassword) {
    return res.status(503).json({ error: 'Admin sign-in is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env.' });
  }
  if (!credentialsMatch(req.body.username, adminUsername) || !credentialsMatch(req.body.password, adminPassword)) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  req.session.regenerate(error => {
    if (error) return next(error);
    req.session.isAdmin = true;
    req.session.save(saveError => {
      if (saveError) return next(saveError);
      res.json({ authenticated: true });
    });
  });
});

app.post('/api/admin/logout', requireAdmin, (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie(sessionCookieName, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.sendStatus(204);
  });
});

app.get('/api/admin/reports', requireAdmin, async (req, res, next) => {
  try {
    res.json(await Report.find().sort({ createdAt: -1 }).lean());
  } catch (error) { next(error); }
});

const reportSchema = new mongoose.Schema({
  kind: { type: String, enum: ['lost', 'found'], required: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true },
  description: { type: String, default: '' },
  date: { type: String, required: true },
  location: { type: String, required: true },
  image: { type: String, default: '' },
  status: { type: String, enum: ['open', 'claimed', 'resolved'], default: 'open' },
  reporter: { type: String, default: 'Campus community' },
  reporterEmail: { type: String, lowercase: true, trim: true },
  claims: [{ name: String, email: String, note: String, status: { type: String, default: 'pending' }, createdAt: { type: Date, default: Date.now } }]
}, { timestamps: true });

const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);

function tokenize(value) {
  return String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2);
}

function scoreMatch(lost, found) {
  let score = 0;
  const reasons = [];
  if (lost.category === found.category) {
    score += 35;
    reasons.push('Same category');
  }
  const lostWords = new Set(tokenize(`${lost.name} ${lost.description}`));
  const foundWords = new Set(tokenize(`${found.name} ${found.description}`));
  const shared = [...lostWords].filter(word => foundWords.has(word));
  if (shared.length) {
    score += Math.min(40, shared.length * 14);
    reasons.push(`Shared details: ${shared.slice(0, 3).join(', ')}`);
  }
  const lostLocation = tokenize(lost.location);
  const foundLocation = new Set(tokenize(found.location));
  if (lostLocation.some(word => foundLocation.has(word))) {
    score += 25;
    reasons.push('Similar campus location');
  }
  const dayGap = Math.abs(new Date(lost.date) - new Date(found.date)) / 86400000;
  if (Number.isFinite(dayGap) && dayGap <= 3) {
    score += Math.max(5, 20 - dayGap * 5);
    reasons.push('Reported around the same date');
  }
  return { score: Math.min(99, score), reasons };
}

async function listReports() {
  return Report.find().sort({ createdAt: -1 }).lean();
}

app.get('/api/activity', async (req, res, next) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid college email.' });
    const reports = await Report.find({ $or: [{ reporterEmail: email }, { 'claims.email': email }] }).sort({ createdAt: -1 }).lean();
    res.json(reports.map(({ reporterEmail, claims = [], ...report }) => ({
      ...report,
      activity: [
        ...(reporterEmail === email ? [{ type: 'report', status: report.status, createdAt: report.createdAt }] : []),
        ...claims.filter(claim => claim.email === email).map(claim => ({ type: 'claim', status: claim.status, createdAt: claim.createdAt }))
      ]
    })));
  } catch (error) { next(error); }
});

app.get('/api/reports', async (req, res, next) => {
  try {
    const reports = await listReports();
    const filtered = reports.filter(report => {
      const kindOk = !req.query.kind || req.query.kind === 'all' || report.kind === req.query.kind;
      const statusOk = !req.query.status || req.query.status === 'all' || report.status === req.query.status;
      const query = String(req.query.q || '').toLowerCase();
      const textOk = !query || `${report.name} ${report.description} ${report.location} ${report.category}`.toLowerCase().includes(query);
      return kindOk && statusOk && textOk;
    });
    res.json(filtered.map(({ reporterEmail, claims, ...report }) => report));
  } catch (error) { next(error); }
});

app.post('/api/reports', async (req, res, next) => {
  try {
    const { kind, name, category, description, date, location, image, reporter, reporterEmail } = req.body;
    const email = String(reporterEmail || '').trim().toLowerCase();
    if (!['lost', 'found'].includes(kind) || !name || !category || !date || !location || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please provide an item, category, date, location, and valid contact email.' });
    }
    const data = { kind, name, category, description: description || '', date, location, image: image || '', reporter: reporter || 'Campus community', reporterEmail: email, status: 'open', claims: [] };
    const report = await Report.create(data);
    const { reporterEmail: savedEmail, claims, ...publicReport } = report.toObject();
    res.status(201).json(publicReport);
  } catch (error) { next(error); }
});

app.get('/api/matches/:id', async (req, res, next) => {
  try {
    const reports = await listReports();
    const source = reports.find(report => String(report._id) === req.params.id);
    if (!source) return res.status(404).json({ error: 'Report not found.' });
    const oppositeKind = source.kind === 'lost' ? 'found' : 'lost';
    const matches = reports.filter(report => report.kind === oppositeKind && report.status === 'open')
      .map(report => ({ report, ...scoreMatch(source.kind === 'lost' ? source : report, source.kind === 'found' ? source : report) }))
      .filter(match => match.score >= 35)
      .sort((a, b) => b.score - a.score);
    res.json(matches.map(({ report, ...match }) => {
      const { reporterEmail, claims, ...publicReport } = report;
      return { report: publicReport, ...match };
    }));
  } catch (error) { next(error); }
});

app.post('/api/reports/:id/claims', async (req, res, next) => {
  try {
    const { name, email, note } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
    const report = await Report.findById(req.params.id);
    if (report) {
      report.claims.push({ name, email: String(email).trim().toLowerCase(), note: note || '' });
      await report.save();
    }
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    res.status(201).json({ message: 'Claim request sent for review.' });
  } catch (error) { next(error); }
});

app.patch('/api/reports/:id/claims/:claimIndex', requireAdmin, async (req, res, next) => {
  try {
    const claimStatus = req.body.status;
    if (!['approved', 'rejected'].includes(claimStatus)) return res.status(400).json({ error: 'Invalid claim status.' });
    const claimIndex = Number(req.params.claimIndex);
    const report = await Report.findById(req.params.id);
    if (report?.claims[claimIndex]) {
      report.claims[claimIndex].status = claimStatus;
      if (claimStatus === 'approved') report.status = 'claimed';
      await report.save();
    }
    if (!report?.claims[claimIndex]) return res.status(404).json({ error: 'Claim request not found.' });
    res.json({ status: report.status });
  } catch (error) { next(error); }
});

app.patch('/api/reports/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['open', 'claimed', 'resolved'];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Invalid report status.' });
    const report = await Report.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    res.json({ status: report.status });
  } catch (error) { next(error); }
});

app.get('/api/stats', async (req, res, next) => {
  try {
    const reports = await listReports();
    res.json({ total: reports.length, lost: reports.filter(item => item.kind === 'lost' && item.status === 'open').length, found: reports.filter(item => item.kind === 'found' && item.status === 'open').length, resolved: reports.filter(item => item.status === 'resolved' || item.status === 'claimed').length, claims: reports.reduce((sum, item) => sum + (item.claims?.length || 0), 0) });
  } catch (error) { next(error); }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

async function start() {
  await mongoose.connect(mongoUri);
  console.log(`Connected to MongoDB at ${mongoose.connection.name}`);
  app.listen(port, () => console.log(`Campus Found is running at http://localhost:${port}`));
}

start().catch(error => {
  console.error('MongoDB connection failed; Campus Found will not start:', error.message);
  process.exitCode = 1;
});
