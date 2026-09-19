const SUPABASE_URL = 'https://erdltqfqxrtiqdmtvunl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0XXgHwC0rUBXJh81WG9vJw_M_srz_X0';
const UPLOAD_LIMIT_PER_DAY = 5;

if (typeof window.supabase === 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        document.body.innerHTML = '<div class="error" style="padding:3rem;text-align:center;">Failed to load Supabase SDK (supabase-js.min.js). Check the browser console.</div>';
    });
    throw new Error('Supabase SDK not loaded');
}

// All photo writes (vote/upload/delete) go through the API server.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentLeft = null;
let currentRight = null;
let currentVoting = false;
let authMode = 'login';

const FUNNY_PROMPTS = [
    "Who is hotter?",
    "Who dies first in a horror movie?",
    "Who looks better next to a warning label?",
    "Who's more likely to be a cryptid?",
    "Who would win a fight with a raccoon?",
    "Who's more likely to haunt this site after they die?",
    "Whose eulogy would be the most savage?",
    "Who's more likely to get banned from the cemetery?",
    "Who would make the better ghost?",
    "Who's more likely to sell their soul first?",
    "Who ends up on Unsolved Mysteries?",
    "Who gets exorcised first?",
    "Who's more likely to outlive their enemies?",
    "Who wins the fight over the inheritance?",
    "Who's more likely to be mistaken for a vampire?",
    "Who looks better on a 'Do Not Approach' poster?",
    "Who's more likely to die of embarrassment?",
    "Who would handle the zombie apocalypse better?",
    "Who's more likely to poison the shared coffee pot?",
    "Who would be the killer in the true-crime documentary?",
    "Who's more likely to get turned into a frog?",
    "Who would win a duel at dawn?",
    "Who's more likely to be summoned by a misfired spell?",
    "Who would be the villain's henchman?",
    "Who would plan their own funeral playlist?",
    "Who's more likely to get haunted by their own ghost?",
    "Who's more likely to start a cult?",
    "Who would win a staring contest with a taxidermied animal?",
    "Who's more likely to end up on a milk carton?",
    "Who would survive longer in a haunted house?",
    "Who's more likely to be the final girl?",
    "Who dies first in the horror movie group chat?",
    "Who's more likely to be the murderer's alibi?",
    "Who's more likely to be buried with their phone?",
    "Who would haunt the bathroom at a family gathering?",
    "Who's more likely to die on this hill?",
    "Who made the creepiest sleep paralysis demon?",
    "Who would get a ring light for their own funeral?",
    "Who's more likely to get cursed for their ancestors' crimes?",
    "Who would win a duel at midnight in a graveyard?",
    "Who's more likely to be the cursed painting in a mansion?",
    "Who would survive a horror movie by being painfully oblivious?"
];

function randomPrompt() {
    return FUNNY_PROMPTS[Math.floor(Math.random() * FUNNY_PROMPTS.length)];
}

function fameTitle(rating) {
    if (rating < 1200) return 'Certified Room Deep';
    if (rating < 1400) return 'Warming Up...';
    if (rating < 1600) return 'Average Enjoyer';
    if (rating < 1800) return 'Main Character';
    if (rating < 2000) return 'Elite Risitas';
    if (rating < 2200) return 'Absolute Him/Her';
    return 'Legendary Icon';
}

function genderBadge(gender) {
    if (!gender) return '';
    const colors = {
        'Male': '#1f5fa8',
        'Female': '#a8325e',
        'Non-binary': '#6a3fbf',
        'Prefer not to say': '#555'
    };
    return `<span class="gender-badge"><span class="g" style="border-color:${colors[gender] || '#555'};">${escapeHtml(gender)}</span></span>`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---- auth state ----
function getToken() { return localStorage.getItem('fm_token'); }
function currentUser() {
    try { return JSON.parse(localStorage.getItem('fm_user') || 'null'); } catch (e) { return null; }
}
function setAuth(token, user) {
    if (token) localStorage.setItem('fm_token', token); else localStorage.removeItem('fm_token');
    if (user) localStorage.setItem('fm_user', JSON.stringify(user)); else localStorage.removeItem('fm_user');
    renderAuth();
}
function authHeaders(extra) {
    const h = Object.assign({}, extra || {});
    const t = getToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
}

function renderAuth() {
    const el = document.getElementById('auth-area');
    const user = currentUser();
    const note = document.getElementById('upload-note');
    if (user) {
        el.innerHTML = `Playing as: <b>${escapeHtml(user.name)}</b> <a class="pill" href="#" onclick="logout();return false;">Logout</a>`;
        if (note) note.innerHTML = `Logged in as <b>${escapeHtml(user.email)}</b>. You can upload up to ${UPLOAD_LIMIT_PER_DAY} photos a day and delete your own photos from the Rankings page.`;
    } else {
        el.innerHTML = `Playing as: <b>Guest</b> <a class="pill" href="#" onclick="openAuthModal('login');return false;">Login</a> <a class="pill filled" href="#" onclick="openAuthModal('signup');return false;">Sign up</a>`;
        if (note) note.innerHTML = `You are playing as a guest. You can upload up to ${UPLOAD_LIMIT_PER_DAY} photos a day. Guests cannot delete photos &mdash; <a href="#" onclick="openAuthModal('login');return false;">log in</a> or <a href="#" onclick="openAuthModal('signup');return false;">sign up</a> to manage yours.`;
    }
}

function openAuthModal(mode) {
    authMode = mode || 'login';
    document.getElementById('auth-title').textContent = authMode === 'signup' ? 'Sign Up' : 'Log In';
    document.getElementById('auth-submit').textContent = authMode === 'signup' ? 'Sign Up' : 'Log In';
    document.getElementById('auth-name').style.display = authMode === 'signup' ? 'block' : 'none';
    const toggle = document.querySelector('.auth-toggle-text');
    toggle.innerHTML = authMode === 'signup'
        ? `Already have an account? <a href="#" onclick="openAuthModal('login');return false;">Log in</a>`
        : `New here? <a href="#" onclick="openAuthModal('signup');return false;">Create an account</a>`;
    const msg = document.getElementById('auth-msg');
    msg.textContent = '';
    msg.className = 'auth-msg';
    document.getElementById('auth-modal').style.display = 'flex';
}

async function submitAuth(e) {
    e.preventDefault();
    const msg = document.getElementById('auth-msg');
    msg.className = 'auth-msg';
    msg.textContent = 'Working...';
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    let body;
    if (authMode === 'signup') {
        const name = document.getElementById('auth-name').value.trim();
        if (!name) { msg.textContent = 'Please enter your name.'; return; }
        body = { email, name, password };
    } else {
        body = { email, password };
    }
    try {
        const res = await fetch(`/api/auth/${authMode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Auth failed');
        setAuth(json.token, json.user);
        loadMyPhotos();
        msg.textContent = 'Success!';
        msg.className = 'auth-msg ok';
        setTimeout(() => {
            closeModal('auth-modal');
            document.getElementById('auth-form').reset();
        }, 400);
    } catch (err) {
        msg.className = 'auth-msg';
        msg.textContent = err.message;
    }
}

function logout() {
    setAuth(null, null);
    loadMyPhotos();
    if (isPage('/upload')) location.href = '/';
}

// ---- helpers ----
const imgCheck = new Map(); // url -> Promise<boolean>
async function imageWorks(url) {
    if (imgCheck.has(url)) return imgCheck.get(url);
    // Cloudinary URLs are validated server-side at upload, so skip the check.
    if (url.indexOf('res.cloudinary.com') !== -1) {
        imgCheck.set(url, Promise.resolve(true));
        return true;
    }
    const p = new Promise(resolve => {
        const img = new Image();
        let done = false;
        const finish = ok => { if (done) return; done = true; clearTimeout(timer); resolve(ok); };
        img.onload = () => finish(true);
        img.onerror = () => finish(false);
        img.src = url;
        const timer = setTimeout(() => finish(false), 4000);
    });
    imgCheck.set(url, p);
    return p;
}

// Check images in parallel (capped), returning the first `max` that load OK.
async function validPhotos(photos, max) {
    const out = [];
    let i = 0;
    const limit = max || photos.length;
    const concurrency = Math.min(12, photos.length);
    if (concurrency === 0) return out;
    const worker = async () => {
        while (i < photos.length && out.length < limit) {
            const p = photos[i++];
            if (await imageWorks(p.image_url)) out.push(p);
        }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    return out;
}

// ---- rating battle ----
async function loadNewPair() {
    const { data: photos, error } = await sb
        .from('photos')
        .select('*')
        .order('rating', { ascending: false });

    if (error) {
        document.getElementById('battle-prompt').textContent = 'Error loading photos.';
        return;
    }

    const valid = await validPhotos(photos || [], null);

    currentVoting = false;

    if (!valid || valid.length < 2) {
        updateBattleArea(null, null);
        return;
    }

    // New-user promotion: newborns (uploaded <72h ago OR under 10 games) are
    // surfaced more often so newcomers get votes and climb faster.
    const now = Date.now();
    const isNewborn = p => {
        const age = now - Date.parse(p.created_at);
        const games = (p.wins || 0) + (p.losses || 0);
        return age < 72 * 3600 * 1000 || games < 10;
    };
    const newborns = valid.filter(isNewborn);

    let contenderA, contenderB;
    if (newborns.length > 0 && Math.random() < 0.6) {
        contenderA = newborns[Math.floor(Math.random() * newborns.length)];
        const others = valid.filter(p => p.id !== contenderA.id)
            .sort((a, b) => Math.abs(a.rating - contenderA.rating) - Math.abs(b.rating - contenderA.rating));
        contenderB = others[Math.floor(Math.random() * Math.min(others.length, 3))];
    } else if (valid.length > 4 && Math.random() < 0.7) {
        contenderA = valid[Math.floor(Math.random() * valid.length)];
        const band = 120;
        const rivals = valid
            .filter(p => p.id !== contenderA.id && Math.abs(p.rating - contenderA.rating) <= band)
            .sort((a, b) => Math.abs(a.rating - contenderA.rating) - Math.abs(b.rating - contenderA.rating));
        if (rivals.length > 0) contenderB = rivals[Math.floor(Math.random() * Math.min(rivals.length, 3))];
        else {
            const others = valid.filter(p => p.id !== contenderA.id);
            contenderB = others[Math.floor(Math.random() * others.length)];
        }
    } else {
        const idx1 = Math.floor(Math.random() * valid.length);
        let idx2 = Math.floor(Math.random() * valid.length);
        let a = 0;
        while (idx2 === idx1 && a++ < 50) idx2 = Math.floor(Math.random() * valid.length);
        contenderA = valid[idx1];
        contenderB = valid[idx2];
    }

    currentLeft = contenderA;
    currentRight = contenderB;

    renderPhoto('left', currentLeft);
    renderPhoto('right', currentRight);
}

function renderPhoto(side, photo) {
    if (!photo) return;
    const id = side;
    document.getElementById(`${id}-photo`).src = photo.image_url;
    document.getElementById(`${id}-name`).textContent = photo.name;
    document.getElementById(`${id}-rating`).textContent = photo.rating;
    document.getElementById(`${id}-gender`).innerHTML = genderBadge(photo.gender);
    const streak = photo.streak || 0;
    document.getElementById(`${id}-streak`).innerHTML = streak > 0 ? `<span class="streak-flame">x${streak}</span>` : '';
    document.getElementById(`${id}-title`).textContent = fameTitle(photo.rating);
}

function updateBattleArea(left, right) {
    const sides = { left, right };
    ['left', 'right'].forEach(s => {
        const p = sides[s];
        document.getElementById(`${s}-photo`).src = p ? p.image_url : '';
        document.getElementById(`${s}-name`).textContent = p ? p.name : 'No photos yet';
        document.getElementById(`${s}-rating`).textContent = p ? p.rating : '-';
        document.getElementById(`${s}-gender`).innerHTML = p ? genderBadge(p.gender) : '';
        document.getElementById(`${s}-streak`).innerHTML = '';
        document.getElementById(`${s}-title`).textContent = p ? fameTitle(p.rating) : '';
    });
}

async function vote(side) {
    if (currentVoting || !currentLeft || !currentRight) return;
    currentVoting = true;
    const winnerId = side === 'left' ? currentLeft.id : currentRight.id;
    const loserId = side === 'left' ? currentRight.id : currentLeft.id;
    try {
        const res = await fetch('/api/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ winnerId, loserId })
        });
        if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            alert('Vote failed: ' + (j.error || res.statusText));
        }
    } catch (e) {
        console.error('vote error:', e);
    }
    await loadNewPair();
}

// ---- upload ----
// Downscale + compress in the browser so the Cloudinary upload is small and fast.
async function compressImage(file) {
    const MAX_EDGE = 1080;
    const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error('Could not read image.'));
        r.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('Not a valid image.'));
        i.src = dataUrl;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82));
    return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
}

async function uploadPhoto(e) {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const gender = document.getElementById('gender').value;
    const raw = document.getElementById('photo').files[0];
    if (!name || !raw) return alert('Please enter your name and select a photo.');
    if (!gender) return alert('Please select your gender.');
    if (raw.size > 5 * 1024 * 1024) return alert('Image should be less than 5MB.');

    const status = document.getElementById('upload-status');
    status.className = 'loading';
    status.style.display = 'block';
    status.textContent = 'Optimizing image...';

    let file;
    try {
        const compressed = await compressImage(raw);
        file = (compressed.blob.size < raw.size * 0.9 && compressed.blob.size < 500 * 1024)
            ? new File([compressed.blob], 'photo.jpg', { type: 'image/jpeg' })
            : raw;
        status.textContent = 'Uploading...';
    } catch (err) {
        status.className = 'error';
        status.textContent = err.message;
        return;
    }

    const fd = new FormData();
    fd.append('name', name);
    fd.append('gender', gender);
    fd.append('file', file);

    try {
        const res = await fetch('/api/upload', { method: 'POST', headers: authHeaders(), body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Upload failed');
        status.className = 'success';
        status.textContent = 'Photo uploaded successfully!';
        e.target.reset();
        document.getElementById('preview').style.display = 'none';
        setTimeout(() => {
            status.style.display = 'none';
            location.href = '/';
        }, 1500);
    } catch (err) {
        status.className = 'error';
        status.textContent = err.message;
        console.error('upload error:', err);
    }
}

// ---- leaderboard ----
const PERIODS = {
    weekly: { label: 'Weekly', winsCol: 'weekly_wins', ratingCol: 'weekly_rating_start', prize: 'Logitech Mouse' },
    monthly: { label: 'Monthly', winsCol: 'monthly_wins', ratingCol: 'monthly_rating_start', prize: 'Play Store Redeem Code' },
    yearly: { label: 'Yearly', winsCol: 'yearly_wins', ratingCol: 'yearly_rating_start', prize: 'Apple Keyboard + Free Domain' }
};
let currentPeriod = 'weekly';

async function loadLeaderboard() {
    const leaderboard = document.getElementById('leaderboard');
    if (!leaderboard) return;
    const cfg = PERIODS[currentPeriod];
    leaderboard.innerHTML = '<p class="loading">Loading rankings...</p>';

    const { data: photos, error } = await sb.from('photos').select('*');
    if (error) {
        leaderboard.innerHTML = `<p class="error">Failed to load rankings: ${error.message}</p>`;
        return;
    }

    const valid = await validPhotos(photos || [], null);

    if (valid.length === 0) {
        leaderboard.innerHTML = `<p class="loading">No photos yet. Be the first to upload!</p>`;
        return;
    }

    valid.sort((a, b) => {
        const ga = a.rating - (a[cfg.ratingCol] || a.rating);
        const gb = b.rating - (b[cfg.ratingCol] || b.rating);
        return (b[cfg.winsCol] || 0) - (a[cfg.winsCol] || 0) || gb - ga;
    });

    leaderboard.innerHTML = '';
    valid.forEach((photo, index) => {
        leaderboard.appendChild(renderLeaderboardItem(photo, index));
    });
}

function renderLeaderboardItem(photo, index) {
    const cfg = PERIODS[currentPeriod];
    const gain = photo.rating - (photo[cfg.ratingCol] || photo.rating);
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    const user = currentUser();
    const isOwner = user && photo.owner_email && photo.owner_email === user.email;
    item.innerHTML = `
        <div class="leaderboard-rank ${index === 0 ? 'gold' : ''}">#${index + 1}</div>
        <img class="leaderboard-photo" src="${photo.image_url}" alt="${escapeHtml(photo.name)}" loading="lazy" decoding="async">
        <div class="leaderboard-info">
            <h3>${escapeHtml(photo.name)} ${photo.gender ? `<small style="color:#777;">(${escapeHtml(photo.gender)})</small>` : ''}</h3>
            <p>${photo[cfg.winsCol]} wins this ${cfg.label.toLowerCase()} &middot; ${gain >= 0 ? '+' : ''}${gain} rating</p>
        </div>
        <div class="leaderboard-rating">${gain >= 0 ? '+' : ''}${gain}</div>
        ${isOwner ? `<button class="delete-btn" onclick="event.stopPropagation();deletePhoto('${photo.id}');">Delete</button>` : ''}
    `;
    return item;
}

function setPeriod(period) {
    currentPeriod = period;
    document.querySelectorAll('.period-tabs a').forEach(a => a.classList.toggle('active', a.dataset.period === period));
    loadLeaderboard();
}

// ---- your photos ----
async function loadMyPhotos() {
    const box = document.getElementById('my-photos');
    const list = document.getElementById('my-photos-list');
    const user = currentUser();
    if (!user) { if (box) box.style.display = 'none'; return; }
    if (!box || !list) return;
    const { data, error } = await sb.from('photos').select('*').eq('owner_email', user.email);
    list.innerHTML = '';
    if (error || !data || data.length === 0) {
        list.innerHTML = '<p class="loading">' + (error ? 'Failed to load your photos.' : 'No photos uploaded yet.') + '</p>';
        box.style.display = 'block';
        return;
    }
    data.forEach(p => {
        const div = document.createElement('div');
        div.className = 'my-photo-item';
        div.innerHTML = `
            <img src="${p.image_url}" alt="" loading="lazy" decoding="async">
            <div class="my-photo-info">
                <b>${escapeHtml(p.name)}</b>
                <small>${escapeHtml(p.gender || '')} &middot; rating ${p.rating} &middot; ${p.wins + (p.losses || 0)} games</small>
            </div>
            <button class="delete-btn" onclick="deletePhoto('${p.id}')">Delete</button>
        `;
        list.appendChild(div);
    });
    box.style.display = 'block';
}

async function deletePhoto(id) {
    if (!confirm('Delete this photo permanently? This cannot be undone.')) return;
    try {
        const res = await fetch(`/api/photos/${id}`, { method: 'DELETE', headers: authHeaders() });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Delete failed');
        await loadLeaderboard();
        await loadMyPhotos();
    } catch (err) {
        alert(err.message);
    }
}

function isPage(name) {
    return (location.pathname || '/').toLowerCase().replace(/\/+$/, '') === name;
}

// ---- navigation / modals ----
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function openFooterModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

async function loadWinners() {
    const box = document.getElementById('winner-banner');
    if (!box) return;
    box.style.display = 'none';
    try {
        const res = await fetch('/api/period-winners');
        if (!res.ok) return;
        const json = await res.json();
        const cards = json.cards || [];
        if (cards.length === 0) return;
        box.innerHTML = cards.map(c => `
            <div class="winner-card">
                <img src="${c.image_url}" alt="${escapeHtml(c.name)}" loading="lazy" decoding="async">
                <div class="winner-info">
                    <div class="winner-kicker">${c.label} WINNER &middot; ${c.period_start}</div>
                    <div class="winner-name">${escapeHtml(c.name)}</div>
                    <div class="winner-stats">${c.wins} wins &middot; rating ${c.rating}</div>
                </div>
            </div>`).join('');
        box.style.display = 'block';
    } catch (e) { /* show nothing on failure */ }
}

function showSection(section) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(`${section}-section`).classList.add('active');
    if (section === 'rate') loadNewPair();
    else if (section === 'leaderboard') { loadLeaderboard(); loadWinners(); }
    else if (section === 'upload') loadMyPhotos();
}

// ---- event wiring ----
const photoInput = document.getElementById('photo');
if (photoInput) {
    photoInput.addEventListener('change', function () {
        const preview = document.getElementById('preview');
        if (this.files && this.files[0]) {
            preview.src = URL.createObjectURL(this.files[0]);
            preview.style.display = 'block';
        }
    });
}

const uploadForm = document.getElementById('upload-form');
if (uploadForm) uploadForm.addEventListener('submit', uploadPhoto);
document.getElementById('auth-form').addEventListener('submit', submitAuth);

async function init() {
    renderAuth();
    if (isPage('/rankings')) {
        loadLeaderboard();
        loadWinners();
    } else if (isPage('/upload')) {
        loadMyPhotos();
        const note = document.getElementById('upload-note');
        if (note && !currentUser()) {
            note.innerHTML = 'You are playing as a guest. You can upload up to 5 photos a day. Guests cannot delete photos &mdash; <a href="#" onclick="openAuthModal(\'login\');return false;">log in</a> or <a href="#" onclick="openAuthModal(\'signup\');return false;">sign up</a> to manage yours.';
        } else if (note && currentUser()) {
            note.innerHTML = 'You are logged in. You can upload up to 5 photos a day and delete your own photos anytime.';
        }
    } else {
        loadNewPair();
    }
}

init();