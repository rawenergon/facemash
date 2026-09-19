import { useEffect, useState } from 'react';
import { api, getUser, UPLOAD_LIMIT_PER_DAY } from '../api.js';
import { GENDERS, compressImage, getOptimizedImageUrl } from '../helpers.js';

export default function Upload() {
  const user = getUser();
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState({ cls: '', text: '' });
  const [mine, setMine] = useState([]);
  const [mineErr, setMineErr] = useState('');

  async function loadMine() {
    try {
      const j = await api('/api/my-photos');
      setMine(j.photos || []);
      setMineErr('');
    } catch (e) {
      setMineErr(e.message);
    }
  }

  useEffect(() => {
    if (user) loadMine();
  }, [user && user.email]);

  function onPick(e) {
    const f = e.target.files && e.target.files[0];
    setFile(f || null);
    if (f) setPreview(URL.createObjectURL(f));
    else setPreview('');
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !file) return alert('Please enter your name and select a photo.');
    if (!gender) return alert('Please select your gender.');
    if (file.size > 15 * 1024 * 1024) return alert('Image should be less than 15MB.');

    setStatus({ cls: 'loading', text: 'Compressing and optimizing image...' });
    let toSend;
    let savingsMsg = '';
    try {
      const compressed = await compressImage(file, 1200, 0.82);
      if (compressed.blob && compressed.blob.size < file.size) {
        toSend = new File([compressed.blob], compressed.name, { type: compressed.mimeType });
        savingsMsg = ` (${compressed.savedPercent}% smaller)`;
      } else {
        toSend = file;
      }
      setStatus({ cls: 'loading', text: 'Uploading photo' + savingsMsg + '...' });
    } catch (err) {
      console.warn('Compression fallback to original file:', err);
      toSend = file;
      setStatus({ cls: 'loading', text: 'Uploading photo...' });
    }

    const fd = new FormData();
    fd.append('name', name.trim());
    fd.append('gender', gender);
    fd.append('file', toSend);

    try {
      await api('/api/upload', { method: 'POST', body: fd });
      setStatus({ cls: 'success', text: 'Photo uploaded successfully!' });
      setName('');
      setGender('');
      setFile(null);
      setPreview('');
      if (user) loadMine();
    } catch (err) {
      setStatus({ cls: 'error', text: err.message });
    }
  }

  async function del(id) {
    if (!confirm('Delete this photo permanently? This cannot be undone.')) return;
    try {
      await api('/api/photos/' + id, { method: 'DELETE' });
      loadMine();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <section id="upload-section" className="section active">
      <h2>Add Photos</h2>
      <p className="upload-note" style={{ display: 'block', maxWidth: 520, margin: '0 auto 20px' }}>
        {user
          ? <>Logged in as <b>{user.email}</b>. You can upload up to {UPLOAD_LIMIT_PER_DAY} photos a day and delete your own photos anytime.</>
          : <>You are playing as a guest. You can upload up to {UPLOAD_LIMIT_PER_DAY} photos a day. Guests cannot delete photos.</>}
      </p>

      <form className="upload-form" onSubmit={submit}>
        <div className="form-group">
          <label htmlFor="name">Name</label>
          <input id="name" type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Enter name" />
        </div>
        <div className="form-group">
          <label htmlFor="gender">Gender</label>
          <select id="gender" value={gender} onChange={e => setGender(e.target.value)}>
            <option value="">Select gender</option>
            {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="photo">Photo</label>
          <input id="photo" type="file" accept="image/*" onChange={onPick} />
          {preview && (
            <div className="preview-container">
              <img src={preview} alt="preview" />
            </div>
          )}
        </div>
        <button type="submit" className="btn-primary">Upload Photo</button>
        {status.text && <div id="upload-status" className={status.cls} style={{ display: 'block' }}>{status.text}</div>}
      </form>

      {user && (
        <div className="my-photos">
          <h3>Your Photos</h3>
          <p className="my-photos-note">Delete any photo you uploaded.</p>
          {mineErr && <p className="error">{mineErr}</p>}
          {!mineErr && mine.length === 0 && <p className="loading">No photos uploaded yet.</p>}
          {mine.map(p => (
            <div className="my-photo-item" key={p.id}>
              <img src={getOptimizedImageUrl(p.image_url, { width: 140, height: 140, crop: 'fill' })} alt="" loading="lazy" decoding="async" />
              <div className="my-photo-info">
                <b>{p.name}</b>
                <small>{p.gender || ''} &middot; rating {p.rating} &middot; {(p.wins || 0) + (p.losses || 0)} games</small>
              </div>
              <button className="delete-btn" onClick={() => del(p.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
