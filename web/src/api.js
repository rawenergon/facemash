const TOKEN_KEY = 'fm_token';
const USER_KEY = 'fm_user';

export const UPLOAD_LIMIT_PER_DAY = 5;

function safeGet(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}

function safeSet(key, value) {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch (e) { /* storage unavailable (e.g. private browsing) */ }
}

export function getToken() {
  return safeGet(TOKEN_KEY);
}

export function getUser() {
  const raw = safeGet(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export function setAuth(token, user) {
  safeSet(TOKEN_KEY, token);
  safeSet(USER_KEY, user ? JSON.stringify(user) : null);
}

export async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const isForm = opts.body instanceof FormData;
  if (opts.body && !isForm) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(path, Object.assign({}, opts, { headers }));
  } catch (e) {
    throw new Error('Network error. Is the server running?');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || ('Request failed (' + res.status + ')'));
  return json;
}

export function logout() {
  setAuth(null, null);
}
