import { Fragment, useEffect, useState } from 'react';
import { api } from '../api.js';
import { supabase } from '../supabase.js';
import { useAuth } from '../auth.jsx';
import { validPhotos, PERIODS, fameTitle, getOptimizedImageUrl } from '../helpers.js';
import Comments from './Comments.jsx';
import { IconTrophy } from './Icons.jsx';

export default function Rankings() {
  const { user } = useAuth();
  const [valid, setValid] = useState([]);
  const [period, setPeriod] = useState('weekly');
  const [cards, setCards] = useState([]);
  const [status, setStatus] = useState('loading');
  const [openComments, setOpenComments] = useState(null);

  async function load() {
    setStatus('loading');
    try {
      const [pj, wj] = await Promise.all([
        api('/api/photos'),
        api('/api/period-winners').catch(() => ({ cards: [] })),
      ]);
      setValid(await validPhotos(pj.photos || [], null));
      setCards(wj.cards || []);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
    }
  }

  useEffect(() => { load(); }, []);

  // Real-time Database: live score and ranking updates from Supabase
  useEffect(() => {
    const channel = supabase
      .channel('realtime-rankings-photos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, payload => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          setValid(prev => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p));
        } else if (payload.eventType === 'INSERT' && payload.new) {
          setValid(prev => [payload.new, ...prev.filter(p => p.id !== payload.new.id)]);
        } else if (payload.eventType === 'DELETE' && payload.old) {
          setValid(prev => prev.filter(p => p.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const cfg = PERIODS[period];
  const sorted = [...valid].sort((a, b) => {
    const ga = a.rating - (a[cfg.ratingCol] || a.rating);
    const gb = b.rating - (b[cfg.ratingCol] || b.rating);
    return (b[cfg.winsCol] || 0) - (a[cfg.winsCol] || 0) || gb - ga;
  });

  async function del(id) {
    if (!confirm('Delete this photo permanently? This cannot be undone.')) return;
    try {
      await api('/api/photos/' + id, { method: 'DELETE' });
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <section id="leaderboard-section" className="section active">
      <div className="page-head">
        <h2>
          <IconTrophy /> Rankings
          <span className="live-pill" title="Connected to Real-time Database">● Live Realtime</span>
        </h2>
        <p>Who&apos;s getting the most love this {cfg.label.toLowerCase()}? (+5 for Hotter, -2 for Not)</p>
      </div>

      {cards.length > 0 && (
        <div className="winner-banner">
          {cards.map(c => (
            <div className="winner-card" key={c.period + c.period_start}>
              <img src={getOptimizedImageUrl(c.image_url, { width: 240, height: 240, crop: 'fill' })} alt={c.name} loading="lazy" decoding="async" />
              <div className="winner-info">
                <div className="winner-kicker">{c.label} WINNER &middot; {c.period_start}</div>
                <div className="winner-name">{c.name}</div>
                <div className="winner-stats">{c.wins} wins &middot; rating {c.rating}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="period-tabs">
        {Object.keys(PERIODS).map(k => (
          <button key={k} className={period === k ? 'active' : ''} onClick={() => setPeriod(k)}>
            {PERIODS[k].label}
          </button>
        ))}
      </div>

      {status === 'loading' && (
        <div className="state-box"><span className="spinner" /> Loading rankings...</div>
      )}
      {status === 'error' && <p className="error">Failed to load rankings.</p>}
      {status === 'ready' && sorted.length === 0 && (
        <div className="state-box">No photos yet. Be the first to upload!</div>
      )}

      <div className="leaderboard-list">
        {sorted.map((photo, index) => {
          const gain = photo.rating - (photo[cfg.ratingCol] || photo.rating);
          const isOwner = user && photo.owner_email && photo.owner_email === user.email;
          const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
          const isOpen = openComments === photo.id;
          return (
            <div key={photo.id}>
              <div className={'leaderboard-item ' + (index < 3 ? 'top' + (index + 1) : '') + (isOpen ? ' open' : '')}
                style={{ animationDelay: Math.min(index, 12) * 45 + 'ms' }}
                onClick={() => setOpenComments(isOpen ? null : photo.id)}>
                <div className={'leaderboard-rank ' + rankClass}>
                  <span>{index + 1}</span>
                </div>
                <div className="leaderboard-photo-wrap">
                  <img className="leaderboard-photo" src={getOptimizedImageUrl(photo.image_url, { width: 140, height: 140, crop: 'fill' })} alt={photo.name}
                    loading="lazy" decoding="async" />
                </div>
                <div className="leaderboard-info">
                  <h3>{photo.name} {photo.gender && <small className="gender-tag">({photo.gender})</small>}</h3>
                  <p>{photo[cfg.winsCol] || 0} wins this {cfg.label.toLowerCase()}</p>
                  <p className="fame-title">{fameTitle(photo.rating)}</p>
                </div>
                <div className={'leaderboard-rating' + (gain > 0 ? ' up' : '')}>
                  {gain > 0 ? '+' + gain : '0'}
                </div>
                {isOwner && (
                  <button className="delete-btn"
                    onClick={e => { e.stopPropagation(); del(photo.id); }}>Delete</button>
                )}
              </div>
              {isOpen && <Comments photoId={photo.id} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
