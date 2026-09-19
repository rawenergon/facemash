export default function SwipeDemo({ onClose }) {
  return (
    <div className="swipe-demo-overlay" onClick={onClose}>
      <div className="swipe-demo-box" onClick={e => e.stopPropagation()}>
        <h3>How to play</h3>

        <div className="demo-stage">
          <div className="demo-card" />
          <div className="demo-label right">HOTTER</div>
          <div className="demo-label left">NOT</div>
          <div className="demo-hand">&#128070;</div>
        </div>

        <p className="demo-line"><b>Compare mode:</b> two photos — tap the one that's hotter, or swipe right on it. Add comments under each photo.</p>
        <p className="demo-line"><b>Single mode:</b> one photo at a time — swipe right (or press <kbd>&rarr;</kbd>) = hot, swipe left (or <kbd>&larr;</kbd>) = not.</p>

        <button className="btn-primary" onClick={onClose}>Got it, let me play</button>
      </div>
    </div>
  );
}
