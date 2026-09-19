import { useEffect, useState } from 'react';
import { api, getUser } from '../api.js';
import { supabase } from '../supabase.js';
import { IconComment } from './Icons.jsx';

function timeAgo(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  return d + 'd ago';
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function Comments({ photoId, photos, compact }) {
  const user = getUser();
  const [comments, setComments] = useState([]);
  const [status, setStatus] = useState('loading');
  const [body, setBody] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [target, setTarget] = useState(photoId || '');
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState('');

  const nameFor = id => {
    if (!id || !photos) return null;
    const p = photos.find(x => x.id === id);
    return p ? p.name : null;
  };

  async function load() {
    setStatus('loading');
    setErr('');
    try {
      const q = photoId ? '?photoId=' + encodeURIComponent(photoId) : '';
      const j = await api('/api/comments' + q);
      setComments(j.comments || []);
      setStatus('ready');
    } catch (e) {
      setErr(e.message);
      setStatus('error');
    }
  }

  useEffect(() => {
    setTarget(photoId || '');
    load();
  }, [photoId]);

  // Real-time Database: listen for new comments live
  useEffect(() => {
    const channel = supabase
      .channel('realtime-comments-' + (photoId || 'all'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, payload => {
        if (!payload.new) return;
        if (!photoId || payload.new.photo_id === photoId) {
          setComments(prev => [payload.new, ...prev.filter(c => c.id !== payload.new.id)]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [photoId]);

  async function post(e) {
    e.preventDefault();
    if (!body.trim()) return;
    if (!photoId && !target) return;
    setPosting(true);
    setErr('');
    try {
      const j = await api('/api/comments', {
        method: 'POST',
        body: JSON.stringify({
          photoId: photoId || target || null,
          comment: body,
          name: authorName || (user && user.name) || 'Anonymous',
        }),
      });
      setComments(c => [j.comment, ...c]);
      setBody('');
    } catch (e2) {
      setErr(e2.message);
    }
    setPosting(false);
  }

  const placeholder = photoId
    ? `Say something about ${nameFor(photoId) || 'this person'}...`
    : (target ? `Say something about ${nameFor(target)}...` : 'Write a comment...');

  return (
    <div className={'comments' + (photoId ? ' comments-inline' : '') + (compact ? ' comments-compact' : '')}>
      {!compact && (
        <div className="comments-title-bar">
          <IconComment className="comments-title-icon" />
          <h4 className="comments-title">
            {photoId ? 'Comments on ' + (nameFor(photoId) || 'this person') : 'All comments'}
          </h4>
        </div>
      )}

      <form className="comment-form" onSubmit={post}>
        <div className="comment-form-row">
          {!photoId && (
            <select value={target} onChange={e => setTarget(e.target.value)} required>
              <option value="">About: choose a person...</option>
              {(photos || []).map(p => (
                <option key={p.id} value={p.id}>About: {p.name}</option>
              ))}
            </select>
          )}
          {!user && (
            <input type="text" placeholder="Your name (optional)" value={authorName}
              onChange={e => setAuthorName(e.target.value)} />
          )}
        </div>
        <div className="comment-form-row">
          <textarea placeholder={placeholder} value={body}
            onChange={e => setBody(e.target.value)} maxLength={2000} />
          <button type="submit" className="btn-primary"
            disabled={posting || !body.trim() || (!photoId && !target)}>
            {posting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>

      {err && <p className="error">{err}</p>}
      {status === 'loading' && <p className="loading">Loading comments...</p>}
      {status === 'ready' && comments.length === 0 && (
        <p className="loading">No comments yet. Be the first!</p>
      )}

      <div className="comment-list">
        {comments.map(c => (
          <div className="comment-item" key={c.id}>
            <div className="comment-avatar">{initials(c.name)}</div>
            <div className="comment-content">
              <div className="comment-head">
                <b>{c.name || 'Anonymous'}</b>
                {!photoId && nameFor(c.photo_id) && (
                  <span className="comment-about"> about {nameFor(c.photo_id)}</span>
                )}
                <span className="comment-time">{timeAgo(c.created_at)}</span>
              </div>
              <div className="comment-body">{c.comment}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}