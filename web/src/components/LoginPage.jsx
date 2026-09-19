import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api, getUser, setAuth } from '../api.js';
import { useAuth } from '../auth.jsx';
import { IconFlame } from './Icons.jsx';

export default function LoginPage() {
  const user = getUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setUser } = useAuth();
  const [mode, setMode] = useState(params.get('signup') ? 'signup' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setOk(false);
    if (mode === 'signup' && !name.trim()) {
      setMsg('Please enter your name.');
      return;
    }
    setBusy(true);
    setMsg('Working...');
    try {
      const body = mode === 'signup'
        ? { email: email.trim(), name: name.trim(), password }
        : { email: email.trim(), password };
      const json = await api('/api/auth/' + mode, { method: 'POST', body: JSON.stringify(body) });
      setAuth(json.token, json.user);
      setUser(json.user);
      setOk(true);
      setMsg(mode === 'signup' ? 'Account created! Redirecting...' : 'Welcome back! Redirecting...');
      setTimeout(() => navigate('/'), 500);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="login-section" className="section active">
      <div className="login-box">
        <h2 className="login-title"><IconFlame className="brand-mark" />FACEMASH</h2>
        <p className="login-tagline">Log in or create an account to play.</p>

        <div className="login-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setMsg(''); }}>
            Log In
          </button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setMsg(''); }}>
            Sign Up
          </button>
        </div>

        <form className="modal-form" onSubmit={submit}>
          {mode === 'signup' && (
            <input type="text" placeholder="Name" value={name}
              onChange={e => setName(e.target.value)} />
          )}
          <input type="email" placeholder="Email" required value={email}
            onChange={e => setEmail(e.target.value)} />
          <input type="password" placeholder="Password (min 6 characters)" required value={password}
            onChange={e => setPassword(e.target.value)} />
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Log In'}
          </button>
          <div className={'auth-msg' + (ok ? ' ok' : '')}>{msg}</div>
        </form>
      </div>
    </section>
  );
}