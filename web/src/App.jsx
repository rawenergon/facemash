import { useState } from 'react';
import { NavLink, Link, Routes, Route } from 'react-router-dom';
import { AuthContext } from './auth.jsx';
import { getUser, setAuth } from './api.js';
import Battle from './components/Battle.jsx';
import Rankings from './components/Rankings.jsx';
import Upload from './components/Upload.jsx';
import CommentsPage from './components/CommentsPage.jsx';
import LoginPage from './components/LoginPage.jsx';

function FooterModal({ title, onClose, children }) {
  return (
    <div className="modal" style={{ display: 'flex' }} onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <span className="close" onClick={onClose}>&times;</span>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(getUser());
  const [prizesOpen, setPrizesOpen] = useState(false);
  const [tncOpen, setTncOpen] = useState(false);

  const doLogout = () => {
    setAuth(null, null);
    setUser(null);
  };

  const authValue = { user, logout: doLogout, setUser };

  return (
    <AuthContext.Provider value={authValue}>
      <div className="page-wrap">
        <div className="header">
          <div className="header-row">
            <div className="header-side" />
            <div className="header-brand">
              <h1 className="title">FACEMASH</h1>
            </div>
            <div className="auth-area">
              {user ? (
                <>
                  Playing as: <b>{user.name}</b>{' '}
                  <a className="pill" onClick={doLogout}>Logout</a>
                </>
              ) : (
                <Link className="pill filled" to="/login">Log In</Link>
              )}
            </div>
          </div>
        </div>

        <div className="tagline">Were we let in for our looks? No. Will we be judged on them? Yes.</div>

        <div className="nav">
          <NavLink to="/" end>Photo Battle</NavLink>
          &nbsp;|&nbsp;
          <NavLink to="/rankings">Rankings</NavLink>
          &nbsp;|&nbsp;
          <NavLink to="/upload">Add Photos</NavLink>
          &nbsp;|&nbsp;
          <NavLink to="/comments">Comments</NavLink>
        </div>
        <hr />

        <Routes>
          <Route path="/" element={<Battle />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/ranking" element={<Rankings />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/comments" element={<CommentsPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>

        <div className="footer">
          <hr />
          <p>
            <a onClick={() => setPrizesOpen(true)}>Prizes</a>
            &nbsp;|&nbsp;
            <a onClick={() => setTncOpen(true)}>Terms &amp; Conditions</a>
          </p>
        </div>
      </div>

      {prizesOpen && (
        <FooterModal title="Prizes" onClose={() => setPrizesOpen(false)}>
          <ul className="prize-list">
            <li><b>Weekly Winner:</b> Logitech Mouse</li>
            <li><b>Monthly Winner:</b> Play Store Redeem Code</li>
            <li><b>Yearly Winner:</b> Google Play yearly + Free Domain</li>
          </ul>
          <p className="prize-note">Winners must email <a href="mailto:devadibxr@gmail.com">devadibxr@gmail.com</a> to claim their prize within 7 days of the period ending.</p>
        </FooterModal>
      )}

      {tncOpen && (
        <FooterModal title="Terms & Conditions" onClose={() => setTncOpen(false)}>
          <ol className="tnc-list">
            <li>All images are uploaded by their respective owners. You are responsible for the content you upload.</li>
            <li>If you find something unusual, offensive, or inappropriate, report it to <a href="mailto:devadibxr@gmail.com">devadibxr@gmail.com</a>.</li>
            <li>Weekly, Monthly, and Yearly winners are determined by the leaderboard ranking at the end of each period (+5 for Hotter, -2 for Not).</li>
            <li>To claim an award, winners must send an email to <a href="mailto:devadibxr@gmail.com">devadibxr@gmail.com</a> with their full name, the photo entry, and the category.</li>
            <li>Claims must be submitted within 7 days of the period ending, otherwise the prize is forfeited.</li>
            <li>One prize per person per prize tier per period.</li>
            <li>Guests may upload photos with instant compression. Logged-in users can delete their own photos.</li>
            <li>This is a fun community game. Play nice.</li>
          </ol>
        </FooterModal>
      )}
    </AuthContext.Provider>
  );
}
