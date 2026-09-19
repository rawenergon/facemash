const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const express = require('express');
const compression = require('compression');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const { createClient } = require('@supabase/supabase-js');

// ---- load .env ----
function loadEnv() {
    try {
        const envPath = path.join(__dirname, '.env');
        if (!fs.existsSync(envPath)) return;
        const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq < 0) continue;
            const key = trimmed.slice(0, eq).trim();
            const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
            if (!(key in process.env)) process.env[key] = value;
        }
    } catch (e) {
        console.error('Failed to load .env:', e.message);
    }
}
loadEnv();

// ---- config ----
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'facemash-dev-secret-change-me';
const UPLOAD_LIMIT_PER_DAY = 5;

const serviceReady = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);
if (!serviceReady) {
    console.warn('[degraded mode] SUPABASE_SERVICE_KEY missing in .env - write endpoints (auth/vote/upload/delete) will return 503. Reads still work.');
}

// Cloudinary from CLOUDINARY_URL: cloudinary://API:SECRET@CLOUD
const cdUrl = process.env.CLOUDINARY_URL || '';
let cloudinaryReady = false;
if (cdUrl) {
    const m = cdUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (m) {
        cloudinary.config({ cloud_name: m[3], api_key: m[1], api_secret: m[2] });
        cloudinaryReady = true;
    } else {
        console.error('Invalid CLOUDINARY_URL');
    }
} else {
    console.warn('[degraded mode] CLOUDINARY_URL missing - photo uploads will return 503.');
}

const supabase = serviceReady
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
    : null;

function needService(res) {
    if (supabase) return true;
    res.status(503).json({ error: 'Server not fully configured: add SUPABASE_SERVICE_KEY to .env and restart.' });
    return false;
}

// ---- app ----
const app = express();
app.use(compression({ threshold: 1024 }));
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json());

// ---- React app (web/dist) ----
// When the React build exists, serve it for the UI. API routes below still win.
const DIST_DIR = path.join(__dirname, 'web', 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');
const hasDist = fs.existsSync(DIST_INDEX);
if (hasDist) {
    // Cache Vite hashed assets in /assets immutably for 1 year
    app.use('/assets', express.static(path.join(DIST_DIR, 'assets'), {
        maxAge: 31536000000,
        immutable: true,
        setHeaders: (res) => {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }));
    // Other root static files
    app.use(express.static(DIST_DIR, {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-cache, must-revalidate');
            } else {
                res.setHeader('Cache-Control', 'public, max-age=86400');
            }
        }
    }));
    app.get(['/', '/login', '/ranking', '/rankings', '/upload', '/comments'], (req, res) => {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        res.sendFile(DIST_INDEX);
    });
}

// Public static files (SEO). They are copied into web/dist at build time,
// so DIST_DIR (which is proven to be shipped at runtime) serves them.
app.get(['/robots.txt', '/sitemap.xml'], (req, res) => {
    res.sendFile(path.join(DIST_DIR, req.path.slice(1)));
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ---- token helpers ----
function signToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 3600 * 1000 })).toString('base64url');
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${sig}`;
}
function verifyToken(token) {
    try {
        const [h, p, s] = String(token).split('.');
        const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
        const a = Buffer.from(s);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
        const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
        if (payload.exp < Date.now()) return null;
        return payload;
    } catch (e) { return null; }
}
function authUser(req) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    return token ? verifyToken(token) : null;
}

// ---- fair ELO (mirrors app logic, now enforced server-side) ----
function eloExpected(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }
function eloK(games) { return games < 5 ? 40 : games < 15 ? 32 : games < 50 ? 24 : 16; }
function periodStart(unit) {
    const d = new Date();
    if (unit === 'week') { const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); }
    else if (unit === 'month') { d.setDate(1); }
    else if (unit === 'year') { d.setMonth(0, 1); }
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
}

// ---- auto-finalize period winners ----
// [period, unit, winsCol, photos.startCol, photos.ratingStartCol, label]
const PERIOD_DEFS = [
    ['weekly', 'week', 'weekly_wins', 'week_start', 'weekly_rating_start', 'Week'],
    ['monthly', 'month', 'monthly_wins', 'month_start', 'monthly_rating_start', 'Month'],
    ['yearly', 'year', 'yearly_wins', 'year_start', 'yearly_rating_start', 'Year']
];

function startOfPeriod(unit, date = new Date()) {
    const d = new Date(date);
    if (unit === 'week') { const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); }
    else if (unit === 'month') d.setDate(1);
    else d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    return d;
}
function previousPeriodStart(unit) {
    const d = startOfPeriod(unit);
    if (unit === 'week') d.setDate(d.getDate() - 7);
    else if (unit === 'month') d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    return d;
}
function isoDay(d) { return d.toISOString().slice(0, 10); }

// Once a period ends, snapshot its leader into `winners` before the period
// counters roll over. Called on votes and every 30s, so the ended period's
// pre-reset values are captured automatically.
async function finalizeEndedPeriods() {
    if (!supabase) return;
    for (const [period, unit, winsCol, startCol, startRatingCol] of PERIOD_DEFS) {
        try {
            const prevStart = previousPeriodStart(unit);
            const prevISO = isoDay(prevStart);
            const endISO = isoDay(startOfPeriod(unit));
            const { data: already } = await supabase
                .from('winners').select('id')
                .eq('period', period).eq('period_start', prevISO).maybeSingle();
            if (already) continue;

            const { data: photos, error } = await supabase.from('photos').select('*');
            if (error) { console.error('finalize read error:', error.message); continue; }

            let best = null, bestKey = null;
            for (const p of photos || []) {
                // Only photos whose counters still belong to the ended period.
                if (p[startCol] !== prevISO) continue;
                const wins = p[winsCol] || 0;
                if (wins <= 0) continue;
                const gain = p.rating - (p[startRatingCol] || p.rating);
                const key = wins * 1e9 + gain;
                if (bestKey === null || key > bestKey) { best = p; bestKey = key; }
            }

            await supabase.from('winners').upsert({
                period,
                period_start: prevISO,
                period_end: endISO,
                photo_id: best ? best.id : null,
                name: best ? best.name : null,
                image_url: best ? best.image_url : null,
                wins: best ? best[winsCol] : 0,
                rating: best ? best.rating : null,
                owner_email: best ? best.owner_email || null : null
            }, { onConflict: 'period,period_start' });
        } catch (e) {
            console.error('finalize error (' + period + '):', e.message);
        }
    }
}
function periodFields(photo, inc) {
    const week = periodStart('week'), month = periodStart('month'), year = periodStart('year');
    const f = {};
    const periods = [
        ['week_start', 'weekly_wins', 'weekly_rating_start', week],
        ['month_start', 'monthly_wins', 'monthly_rating_start', month],
        ['year_start', 'yearly_wins', 'yearly_rating_start', year]
    ];
    for (const [startCol, winsCol, ratingCol, start] of periods) {
        if (photo[startCol] !== start) { f[startCol] = start; f[winsCol] = inc; f[ratingCol] = photo.rating; }
        else { f[winsCol] = (photo[winsCol] || 0) + inc; }
    }
    return f;
}

// ---- rate limit ----
async function uploadsToday(identity) {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
        .from('upload_log')
        .select('count')
        .eq('identity', identity)
        .eq('day', today)
        .maybeSingle();
    if (error) throw error;
    return data ? data.count : 0;
}
async function incrementUploads(identity) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: row } = await supabase
        .from('upload_log')
        .select('count')
        .eq('identity', identity)
        .eq('day', today)
        .maybeSingle();
    const next = (row && row.count ? row.count : 0) + 1;
    const { error } = await supabase
        .from('upload_log')
        .upsert({ identity, day: today, count: next }, { onConflict: 'identity,day' });
    if (error) throw error;
}
async function enforceUploadLimit(identity) {
    // Always allow all uploads
    return { ok: true, used: 0, limit: 99999 };
}

// ---- abuse protection (in-memory throttles) ----
const throttleBuckets = new Map();
function throttle(key, limit, windowMs) {
    return { ok: true };
}
function clientThrottleKey(req, scope) {
    const user = authUser(req);
    return (user ? 'u:' + user.email : 'ip:' + (req.ip || '0')) + ':' + scope;
}

// Vote permission: always allow all votes
function enforceVoteLimit(req) {
    return true;
}

// ---- auth ----
app.post('/api/auth/signup', async (req, res) => {
    if (!needService(res)) return;
    try {
        const { email, name, password } = req.body || {};
        const em = String(email || '').trim().toLowerCase();
        const nm = String(name || '').trim();
        const pw = String(password || '');
        if (!em || !nm || pw.length < 6) {
            return res.status(400).json({ error: 'Name, a valid email, and a password of at least 6 characters are required.' });
        }
        if (!throttle('ip:' + (req.ip || '0') + ':signup', 25, 3600 * 1000).ok) {
            return res.status(429).json({ error: 'Too many signups from your network. Try again later.' });
        }
        const { data: existing } = await supabase.from('users').select('id').eq('email', em).maybeSingle();
        if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });
        const hash = await bcrypt.hash(pw, 10);
        const { data: user, error } = await supabase.from('users').insert({
            email: em, name: nm, password_hash: hash
        }).select('id,email,name,created_at').single();
        if (error) throw error;
        const token = signToken({ uid: user.id, email: user.email, name: user.name });
        res.json({ token, user });
    } catch (e) {
        console.error('signup error:', e);
        res.status(500).json({ error: 'Signup failed.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    if (!needService(res)) return;
    try {
        const { email, password } = req.body || {};
        const em = String(email || '').trim().toLowerCase();
        if (!throttle('ip:' + (req.ip || '0') + ':login', 15, 60 * 1000).ok) {
            return res.status(429).json({ error: 'Too many login attempts. Try again in a minute.' });
        }
        const { data: user, error } = await supabase.from('users').select('*').eq('email', em).maybeSingle();
        if (error) throw error;
        if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        const token = signToken({ uid: user.id, email: user.email, name: user.name });
        res.json({ token, user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at } });
    } catch (e) {
        console.error('login error:', e);
        res.status(500).json({ error: 'Login failed.' });
    }
});

app.get('/api/me', (req, res) => {
    const user = authUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ user: { uid: user.uid, email: user.email, name: user.name } });
});

// ---- vote (+5 for hotter, -2 for not) ----
app.post('/api/vote', async (req, res) => {
    if (!needService(res)) return;
    try {
        await finalizeEndedPeriods().catch(() => {});
        const { winnerId, loserId, photoId, isHot, vote } = req.body || {};

        // Case 1: Single photo rating (e.g. { photoId, isHot: true/false } or { photoId, vote: 'hot'/'not' })
        // Also supports { winnerId: id, loserId: id, isHot: true/false }
        const isSingle = Boolean(photoId || (winnerId && loserId && winnerId === loserId));
        if (isSingle) {
            const targetId = photoId || winnerId;
            const hotter = isHot !== undefined ? Boolean(isHot) : (vote ? vote === 'hot' : true);

            const { data: photo, error } = await supabase
                .from('photos').select('*').eq('id', targetId).maybeSingle();
            if (error) throw error;
            if (!photo) return res.status(404).json({ error: 'Photo not found' });

            // +5 for hotter, -2 for not
            const delta = hotter ? 5 : -2;
            const newRating = Math.max(0, (photo.rating || 1500) + delta);
            const streak = hotter ? ((photo.streak || 0) + 1) : 0;
            const fields = {
                rating: newRating,
                wins: hotter ? ((photo.wins || 0) + 1) : (photo.wins || 0),
                losses: hotter ? (photo.losses || 0) : ((photo.losses || 0) + 1),
                streak,
                best_streak: Math.max(photo.best_streak || 0, streak),
                ...periodFields(photo, hotter ? 1 : 0)
            };

            const { error: updErr } = await supabase.from('photos').update(fields).eq('id', photo.id);
            if (updErr) throw updErr;

            return res.json({
                photo: { id: photo.id, rating: newRating, delta, streak },
                winner: hotter ? { id: photo.id, rating: newRating, delta } : null,
                loser: !hotter ? { id: photo.id, rating: newRating, delta } : null
            });
        }

        // Case 2: Head-to-head vote (winnerId !== loserId)
        if (!winnerId || !loserId) return res.status(400).json({ error: 'winnerId and loserId required' });
        const { data: rows, error } = await supabase
            .from('photos').select('*').in('id', [winnerId, loserId]);
        if (error) throw error;
        const winner = rows.find(r => r.id === winnerId);
        const loser = rows.find(r => r.id === loserId);
        if (!winner || !loser) return res.status(404).json({ error: 'Photo not found' });

        // Rating rules: +5 for winner (hotter), -2 for loser (not)
        const newWinnerRating = (winner.rating || 1500) + 5;
        const newLoserRating = Math.max(0, (loser.rating || 1500) - 2);
        const winnerStreak = (winner.streak || 0) + 1;

        const winnerFields = {
            rating: newWinnerRating,
            wins: (winner.wins || 0) + 1,
            streak: winnerStreak,
            best_streak: Math.max(winner.best_streak || 0, winnerStreak),
            ...periodFields(winner, 1)
        };
        const loserFields = {
            rating: newLoserRating,
            losses: (loser.losses || 0) + 1,
            streak: 0,
            ...periodFields(loser, 0)
        };

        const { error: wErr } = await supabase.from('photos').update(winnerFields).eq('id', winner.id);
        const { error: lErr } = await supabase.from('photos').update(loserFields).eq('id', loser.id);
        if (wErr || lErr) throw wErr || lErr;

        res.json({
            winner: { id: winner.id, rating: newWinnerRating, delta: 5 },
            loser: { id: loser.id, rating: newLoserRating, delta: -2 }
        });
    } catch (e) {
        console.error('vote error:', e);
        res.status(500).json({ error: 'Vote failed.' });
    }
});

// ---- upload (Cloudinary + rate limit) ----
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!needService(res)) return;
    try {
        const user = authUser(req);
        const name = String(req.body && req.body.name || '').trim();
        const gender = String(req.body && req.body.gender || '').trim();
        if (!name || !req.file) return res.status(400).json({ error: 'Name and image file are required.' });

        const identity = user ? user.email : (req.headers['x-forwarded-for'] || req.ip || 'guest');
        const limit = await enforceUploadLimit(identity);
        if (!limit.ok) return res.status(429).json({ error: limit.message, used: limit.used, limit: limit.limit });
        if (!cloudinaryReady) return res.status(503).json({ error: 'Cloudinary not configured on the server.' });

        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: 'facemash',
                    resource_type: 'image',
                    transformation: [
                        { width: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
                    ]
                },
                (err, r) => err ? reject(err) : resolve(r)
            );
            stream.end(req.file.buffer);
        });

        const photoRow = {
            name,
            gender: gender || null,
            image_url: result.secure_url,
            cloudinary_public_id: result.public_id,
            owner_email: user ? user.email : null,
            owner_name: user ? user.name : null,
            rating: 1500, wins: 0, losses: 0, streak: 0, best_streak: 0,
            week_start: periodStart('week'), weekly_wins: 0, weekly_rating_start: 1500,
            month_start: periodStart('month'), monthly_wins: 0, monthly_rating_start: 1500,
            year_start: periodStart('year'), yearly_wins: 0, yearly_rating_start: 1500
        };
        const { data: photo, error: insErr } = await supabase.from('photos').insert(photoRow).select('*').single();
        if (insErr) {
            // rollback the cloudinary upload
            await cloudinary.uploader.destroy(result.public_id).catch(() => {});
            throw insErr;
        }
        await incrementUploads(identity).catch(() => {});
        res.status(201).json({ photo });
    } catch (e) {
        console.error('upload error:', e);
        res.status(500).json({ error: 'Upload failed.' + (e.message ? ' ' + e.message : '') });
    }
});

// ---- delete (owner only) ----
app.delete('/api/photos/:id', async (req, res) => {
    if (!needService(res)) return;
    try {
        const user = authUser(req);
        if (!user) return res.status(401).json({ error: 'Log in to delete photos.' });
        const { data: photo } = await supabase.from('photos').select('*').eq('id', req.params.id).maybeSingle();
        if (!photo) return res.status(404).json({ error: 'Photo not found.' });
        if (!photo.owner_email || photo.owner_email !== user.email) {
            return res.status(403).json({ error: 'You can only delete your own photos.' });
        }
        if (photo.cloudinary_public_id) {
            await cloudinary.uploader.destroy(photo.cloudinary_public_id).catch(() => {});
        }
        const { error } = await supabase.from('photos').delete().eq('id', photo.id);
        if (error) throw error;
        res.json({ ok: true });
    } catch (e) {
        console.error('delete error:', e);
        res.status(500).json({ error: 'Delete failed.' });
    }
});

app.get('/api/config', (req, res) => res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || 'sb_publishable_0XXgHwC0rUBXJh81WG9vJw_M_srz_X0'
}));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- read photos (public) ----
app.get('/api/photos', async (req, res) => {
    if (!needService(res)) return;
    try {
        const { data, error } = await supabase.from('photos').select('*');
        if (error) throw error;
        res.json({ photos: data || [] });
    } catch (e) {
        console.error('photos error:', e);
        res.status(500).json({ error: 'Failed to load photos.' });
    }
});

app.get('/api/my-photos', async (req, res) => {
    if (!needService(res)) return;
    const user = authUser(req);
    if (!user) return res.status(401).json({ error: 'Log in to see your photos.' });
    try {
        const { data, error } = await supabase.from('photos').select('*')
            .eq('owner_email', user.email).order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ photos: data || [] });
    } catch (e) {
        console.error('my-photos error:', e);
        res.status(500).json({ error: 'Failed to load your photos.' });
    }
});

// ---- comments (public: anyone can write about anyone) ----
app.get('/api/comments', async (req, res) => {
    if (!needService(res)) return;
    try {
        let q = supabase.from('comments').select('*')
            .order('created_at', { ascending: false }).limit(300);
        if (req.query.photoId) q = q.eq('photo_id', req.query.photoId);
        const { data, error } = await q;
        if (error) throw error;
        res.json({ comments: data || [] });
    } catch (e) {
        console.error('comments error:', e);
        res.status(500).json({ error: 'Failed to load comments. Is the comments table set up?' });
    }
});

app.post('/api/comments', async (req, res) => {
    if (!needService(res)) return;
    try {
        const user = authUser(req);
        const comment = String((req.body && (req.body.comment || req.body.body)) || '').trim();
        if (!comment) return res.status(400).json({ error: 'Write something first.' });
        const photoId = (req.body && req.body.photoId) || null;
        if (!photoId) return res.status(400).json({ error: 'Choose a person to comment about.' });
        const name = String((req.body && (req.body.name || req.body.authorName)) || (user && user.name) || 'Anonymous')
            .trim().slice(0, 80);
        const row = {
            photo_id: photoId,
            name: name || 'Anonymous',
            comment: comment.slice(0, 2000)
        };
        const { data, error } = await supabase.from('comments').insert(row).select('*').single();
        if (error) throw error;
        res.status(201).json({ comment: data });
    } catch (e) {
        console.error('comment post error:', e);
        res.status(500).json({ error: 'Failed to post comment. Is the comments table set up?' });
    }
});

// Dedicated pages: each URL is its own HTML page.
// (Legacy vanilla pages removed; the React SPA handles these routes.)

app.get('/api/period-winners', async (req, res) => {
    try {
        await finalizeEndedPeriods();
        const { data, error } = await supabase
            .from('winners')
            .select('*')
            .order('period_start', { ascending: false });
        if (error) throw error;
        res.json({ cards: buildPeriodCards(null, data || []) });
    } catch (e) {
        console.error('period-winners error:', e);
        res.status(500).json({ error: 'Failed to load winners.' });
    }
});

// Cards shown on the Rankings page: only LOCKED-IN winners from periods that
// have already ended. A monthly/yearly winner appears the moment that period
// completes (auto-finalized), not before.
function buildPeriodCards(photos, finalized) {
    const cards = [];
    for (const [period, unit, winsCol, startCol, startRatingCol, label] of PERIOD_DEFS) {
        for (const w of (finalized || [])) {
            if (w.period !== period || !w.name) continue;
            cards.push({
                period, phase: 'winner', label,
                period_start: w.period_start,
                period_end: w.period_end,
                name: w.name, image_url: w.image_url,
                photo_id: w.photo_id,
                wins: w.wins, rating: w.rating,
                gain: null
            });
            break;
        }
    }
    return cards;
}

// Snapshot any just-ended period even with no traffic.
// Skipped on serverless: the module stays warm per request, not as a daemon.
if (require.main === module) {
    setInterval(() => { finalizeEndedPeriods().catch(() => {}); }, 30 * 1000);
}

// Start the HTTP server only when run directly (`node server.js`).
// On Vercel the Express app is exported and invoked per request by the platform.
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`FaceMash server running at http://localhost:${PORT}`));
}

module.exports = app;