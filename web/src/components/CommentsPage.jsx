import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { getOptimizedImageUrl } from '../helpers.js';
import Comments from './Comments.jsx';
import { IconComment } from './Icons.jsx';

export default function CommentsPage() {
  const [photos, setPhotos] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    api('/api/photos')
      .then(j => setPhotos(j.photos || []))
      .catch(() => setPhotos([]));
  }, []);

  const selected = photos.find(p => p.id === selectedId) || null;

  return (
    <section id="comments-section" className="section active">
      <div className="comments-page-head">
        <h2><IconComment /> Comments</h2>
        <p>Pick a person to see their comments, or write your own.</p>
      </div>

      <div className="people-strip">
        {photos.map(p => (
          <button
            key={p.id}
            className={'people-chip' + (p.id === selectedId ? ' active' : '')}
            onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
            title={p.name}
          >
            <span className="people-avatar" style={{ backgroundImage: `url(${getOptimizedImageUrl(p.image_url, { width: 96, height: 96, crop: 'fill' })})` }} />
            <span className="people-name">{p.name}</span>
          </button>
        ))}
        {photos.length === 0 && <p className="loading">Loading people...</p>}
      </div>

      {selected && (
        <div className="chat-banner">
          <span className="chat-banner-avatar" style={{ backgroundImage: `url(${getOptimizedImageUrl(selected.image_url, { width: 96, height: 96, crop: 'fill' })})` }} />
          <span>Commenting about <b>{selected.name}</b></span>
          <button className="pill" onClick={() => setSelectedId(null)}>View all</button>
        </div>
      )}

      <Comments photoId={selectedId || undefined} photos={photos} />
    </section>
  );
}