import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api.js';
import { supabase } from '../supabase.js';
import { validPhotos, getOptimizedImageUrl, fameTitle, genderColor } from '../helpers.js';
import Comments from './Comments.jsx';
import { IconComment } from './Icons.jsx';

function preloadImage(url) {
  if (!url) return;
  const img = new Image();
  img.src = getOptimizedImageUrl(url, { width: 600 });
}

export default function Battle() {
  const [left, setLeft] = useState(null);
  const [right, setRight] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [votedSide, setVotedSide] = useState(null);
  const [activeCommentsPhoto, setActiveCommentsPhoto] = useState(null);

  const photosRef = useRef([]);
  const queueRef = useRef([]);
  const isVotingRef = useRef(false);

  function pickPair(excludeIds = []) {
    const valid = photosRef.current;
    if (!valid || valid.length < 2) return [null, null];

    const available = valid.filter(p => !excludeIds.includes(p.id));
    const pool = available.length >= 2 ? available : valid;

    const i1 = Math.floor(Math.random() * pool.length);
    let i2 = Math.floor(Math.random() * pool.length);
    let guard = 0;
    while (i2 === i1 && pool.length > 1 && guard++ < 30) {
      i2 = Math.floor(Math.random() * pool.length);
    }

    const p1 = pool[i1];
    const p2 = pool[i2];

    preloadImage(p1?.image_url);
    preloadImage(p2?.image_url);

    return [p1, p2];
  }

  function fillQueue(currentPair = []) {
    const currentIds = currentPair.map(p => p ? p.id : null).filter(Boolean);
    while (queueRef.current.length < 2) {
      const pair = pickPair(currentIds);
      if (pair[0] && pair[1]) {
        queueRef.current.push(pair);
      } else {
        break;
      }
    }
  }

  async function initBattle() {
    try {
      if (!photosRef.current.length) {
        const { photos } = await api('/api/photos');
        photosRef.current = await validPhotos(photos || [], null);
      }
      const valid = photosRef.current;
      if (valid.length < 2) {
        setStatus('empty');
        return;
      }

      const [p1, p2] = pickPair([]);
      setLeft(p1);
      setRight(p2);
      fillQueue([p1, p2]);
      setStatus('ready');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }

  // Real-time Database: sync score changes live
  useEffect(() => {
    const channel = supabase
      .channel('realtime-2003-battle')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, payload => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          photosRef.current = photosRef.current.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p);
          setLeft(curr => (curr && curr.id === payload.new.id ? { ...curr, ...payload.new } : curr));
          setRight(curr => (curr && curr.id === payload.new.id ? { ...curr, ...payload.new } : curr));
        } else if (payload.eventType === 'INSERT' && payload.new) {
          photosRef.current = [payload.new, ...photosRef.current.filter(p => p.id !== payload.new.id)];
        } else if (payload.eventType === 'DELETE' && payload.old) {
          photosRef.current = photosRef.current.filter(p => p.id !== payload.old.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const castVote = useCallback((chosenSide) => {
    if (!left || !right || isVotingRef.current) return;
    isVotingRef.current = true;

    const winner = chosenSide === 'left' ? left : right;
    const loser = chosenSide === 'left' ? right : left;

    setVotedSide(chosenSide);

    const newWinnerRating = (winner.rating || 1500) + 5;
    const newWinnerStreak = (winner.streak || 0) + 1;
    const newLoserRating = Math.max(0, (loser.rating || 1500) - 2);

    // Optimistically update memory pool
    photosRef.current = photosRef.current.map(p => {
      if (p.id === winner.id) {
        return { ...p, rating: newWinnerRating, wins: (p.wins || 0) + 1, streak: newWinnerStreak };
      }
      if (p.id === loser.id) {
        return { ...p, rating: newLoserRating, losses: (p.losses || 0) + 1, streak: 0 };
      }
      return p;
    });

    // Send API in background
    api('/api/vote', {
      method: 'POST',
      body: JSON.stringify({ winnerId: winner.id, loserId: loser.id }),
    }).catch(e => console.warn('Vote background sync:', e.message));

    // Next preloaded match
    setTimeout(() => {
      setVotedSide(null);
      let nextPair = queueRef.current.shift();
      if (!nextPair || !nextPair[0] || !nextPair[1]) {
        nextPair = pickPair([winner.id, loser.id]);
      }
      setLeft(nextPair[0]);
      setRight(nextPair[1]);
      fillQueue(nextPair);
      isVotingRef.current = false;
    }, 220);
  }, [left, right]);

  function skipMatch() {
    if (isVotingRef.current) return;
    const [p1, p2] = pickPair([left?.id, right?.id]);
    setLeft(p1);
    setRight(p2);
  }

  // Keyboard navigation: Left Arrow -> Left, Right Arrow -> Right
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        castVote('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        castVote('right');
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        skipMatch();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [castVote]);

  useEffect(() => { initBattle(); }, []);

  return (
    <section id="rate-section" className="section active">
      <div className="prompt" id="battle-prompt">Who&apos;s Hotter? Click to Choose.</div>

      {status === 'loading' && <p className="loading">Loading photos...</p>}
      {status === 'error' && <p className="error">Failed to load photos: {error}</p>}
      {status === 'empty' && <p className="loading">No photos yet. Be the first to upload!</p>}

      {status === 'ready' && left && right && (
        <div className="battle-container">
          {/* Left Contender */}
          <div
            className={'photo-card ' + (votedSide === 'left' ? 'voted-winner' : '')}
            onClick={() => castVote('left')}
          >
            <div className="img-wrap">
              <img
                src={getOptimizedImageUrl(left.image_url, { width: 600 })}
                alt={left.name}
                fetchpriority="high"
                decoding="async"
              />
              <button
                className="card-comment-icon"
                title="Comments"
                onClick={e => { e.stopPropagation(); setActiveCommentsPhoto(left.id); }}
              >
                <IconComment />
              </button>
            </div>
            <div className="name">{left.name}</div>
            <div className="choices">
              <a
                className="choice-btn hot"
                onClick={e => { e.stopPropagation(); castVote('left'); }}
              >
                HOTTER (+5)
              </a>
              &nbsp;&nbsp;
              <a
                className="choice-btn not"
                onClick={e => { e.stopPropagation(); castVote('right'); }}
              >
                NOT (-2)
              </a>
            </div>
            <div className="stats">
              {left.gender && (
                <span className="gender-badge">
                  <span className="g" style={{ borderColor: genderColor(left.gender) }}>{left.gender}</span>
                </span>
              )}
              <div>
                Rating: <b>{left.rating}</b>
                {(left.streak || 0) > 0 && <span className="streak-flame"> x{left.streak}</span>}
              </div>
              <div className="fame-title">{fameTitle(left.rating)}</div>
            </div>
          </div>

          {/* Central OR Divider */}
          <div className="vs-badge">OR</div>

          {/* Right Contender */}
          <div
            className={'photo-card ' + (votedSide === 'right' ? 'voted-winner' : '')}
            onClick={() => castVote('right')}
          >
            <div className="img-wrap">
              <img
                src={getOptimizedImageUrl(right.image_url, { width: 600 })}
                alt={right.name}
                fetchpriority="high"
                decoding="async"
              />
              <button
                className="card-comment-icon"
                title="Comments"
                onClick={e => { e.stopPropagation(); setActiveCommentsPhoto(right.id); }}
              >
                <IconComment />
              </button>
            </div>
            <div className="name">{right.name}</div>
            <div className="choices">
              <a
                className="choice-btn hot"
                onClick={e => { e.stopPropagation(); castVote('right'); }}
              >
                HOTTER (+5)
              </a>
              &nbsp;&nbsp;
              <a
                className="choice-btn not"
                onClick={e => { e.stopPropagation(); castVote('left'); }}
              >
                NOT (-2)
              </a>
            </div>
            <div className="stats">
              {right.gender && (
                <span className="gender-badge">
                  <span className="g" style={{ borderColor: genderColor(right.gender) }}>{right.gender}</span>
                </span>
              )}
              <div>
                Rating: <b>{right.rating}</b>
                {(right.streak || 0) > 0 && <span className="streak-flame"> x{right.streak}</span>}
              </div>
              <div className="fame-title">{fameTitle(right.rating)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="skip">
        <a onClick={skipMatch}>Skip this match</a>
      </div>

      {activeCommentsPhoto && (
        <div className="modal" style={{ display: 'flex' }} onClick={() => setActiveCommentsPhoto(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <span className="close" onClick={() => setActiveCommentsPhoto(null)}>&times;</span>
            <Comments photoId={activeCommentsPhoto} compact />
          </div>
        </div>
      )}
    </section>
  );
}
