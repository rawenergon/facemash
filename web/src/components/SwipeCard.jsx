import { useEffect, useRef, useState } from 'react';
import { fameTitle, genderColor, getOptimizedImageUrl } from '../helpers.js';

export default function SwipeCard({ photo, side, onSwipe, onChoose, showElo = true, fly }) {
  const [drag, setDrag] = useState({ x: 0, y: 0, dragging: false, gone: null });
  const start = useRef(null);
  const moved = useRef(false);
  const flyRef = useRef(null);

  const THRESHOLD = 80;

  useEffect(() => {
    if (!fly) return;
    if (fly === flyRef.current) return;
    flyRef.current = fly;
    const dir = fly;
    setDrag({ x: dir === 'right' ? 380 : -380, y: 10, dragging: false, gone: dir });
    const cb = onSwipe;
    setTimeout(() => cb(side, dir), 170);
  }, [fly]);

  function down(e) {
    if (drag.gone) return;
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    setDrag({ x: 0, y: 0, dragging: true, gone: null });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }

  function move(e) {
    if (!drag.dragging || !start.current) return;
    const x = e.clientX - start.current.x;
    const y = e.clientY - start.current.y;
    if (Math.abs(x) > 6 || Math.abs(y) > 6) moved.current = true;
    setDrag({ x, y, dragging: true, gone: null });
  }

  function up() {
    if (!drag.dragging) return;
    const dx = drag.x;
    if (Math.abs(dx) > THRESHOLD) {
      const dir = dx > 0 ? 'right' : 'left';
      setDrag({ x: dx * 4, y: drag.y, dragging: false, gone: dir });
      const cb = onSwipe;
      setTimeout(() => cb(side, dir), 170);
    } else {
      setDrag({ x: 0, y: 0, dragging: false, gone: null });
    }
    start.current = null;
  }

  function clickCard() {
    if (moved.current) return;
    onChoose(side);
  }

  const rotate = drag.x / 18;
  const stamp = drag.x > 30 ? 'HOTTER +5' : drag.x < -30 ? 'NOT -2' : null;
  const style = {
    transform: `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${rotate}deg)`,
    opacity: drag.gone ? 0 : 1,
    transition: drag.dragging ? 'none' : 'transform .2s cubic-bezier(0.2, 0.9, 0.3, 1), opacity .18s ease',
    willChange: 'transform, opacity',
    touchAction: 'none',
  };

  const optimizedSrc = getOptimizedImageUrl(photo.image_url, { width: 720 });

  return (
    <div className="photo-card swipe-card" style={style}
      onPointerDown={down} onPointerMove={move}
      onPointerUp={up} onPointerCancel={up}
      onClick={clickCard}>
      {stamp && <div className={'swipe-stamp ' + (stamp.startsWith('HOTTER') ? 'hot' : 'not')}>{stamp}</div>}
      <div className="img-wrap">
        <img src={optimizedSrc} alt={photo.name}
          fetchpriority="high" decoding="async" draggable="false" />
        {showElo && (
          <div className="elo-badge">
            <span className="elo-label">ELO</span><b>{photo.rating}</b>
          </div>
        )}
      </div>
      <div className="name">
        {photo.name}
        {(photo.streak || 0) > 0 && <span className="streak-flame"> x{photo.streak}</span>}
      </div>
      <div className="stats">
        {photo.gender && (
          <span className="gender-badge">
            <span className="g" style={{ borderColor: genderColor(photo.gender) }}>{photo.gender}</span>
          </span>
        )}
        <div className="fame-title">{fameTitle(photo.rating)}</div>
      </div>
    </div>
  );
}
