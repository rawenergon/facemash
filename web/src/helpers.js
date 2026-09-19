export const FUNNY_PROMPTS = [
  "Who is hotter?",
  "Who dies first in a horror movie?",
  "Who looks better next to a warning label?",
  "Who's more likely to be a cryptid?",
  "Who would win a fight with a raccoon?",
  "Who's more likely to haunt this site after they die?",
  "Whose eulogy would be the most savage?",
  "Who's more likely to get banned from the cemetery?",
  "Who would make the better ghost?",
  "Who's more likely to sell their soul first?",
  "Who ends up on Unsolved Mysteries?",
  "Who gets exorcised first?",
  "Who's more likely to outlive their enemies?",
  "Who wins the fight over the inheritance?",
  "Who's more likely to be mistaken for a vampire?",
  "Who looks better on a 'Do Not Approach' poster?",
  "Who's more likely to die of embarrassment?",
  "Who would handle the zombie apocalypse better?",
  "Who's more likely to poison the shared coffee pot?",
  "Who would be the killer in the true-crime documentary?",
  "Who's more likely to get turned into a frog?",
  "Who would win a duel at dawn?",
  "Who's more likely to be summoned by a misfired spell?",
  "Who would be the villain's henchman?",
  "Who would plan their own funeral playlist?",
  "Who's more likely to get haunted by their own ghost?",
  "Who's more likely to start a cult?",
  "Who would win a staring contest with a taxidermied animal?",
  "Who's more likely to end up on a milk carton?",
  "Who would survive longer in a haunted house?",
  "Who's more likely to be the final girl?",
  "Who dies first in the horror movie group chat?",
  "Who's more likely to be the murderer's alibi?",
  "Who's more likely to be buried with their phone?",
  "Who would haunt the bathroom at a family gathering?",
  "Who's more likely to die on this hill?",
  "Who made the creepiest sleep paralysis demon?",
  "Who would get a ring light for their own funeral?",
  "Who's more likely to get cursed for their ancestors' crimes?",
  "Who would win a duel at midnight in a graveyard?",
  "Who's more likely to be the cursed painting in a mansion?",
  "Who would survive a horror movie by being painfully oblivious?"
];

export const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

const GENDER_COLORS = {
  'Male': '#1f5fa8',
  'Female': '#a8325e',
  'Non-binary': '#6a3fbf',
  'Prefer not to say': '#555'
};

export function genderColor(gender) {
  return GENDER_COLORS[gender] || '#555';
}

export function randomPrompt() {
  return FUNNY_PROMPTS[Math.floor(Math.random() * FUNNY_PROMPTS.length)];
}

export function fameTitle(rating) {
  if (rating < 1200) return 'Certified Room Deep';
  if (rating < 1400) return 'Warming Up...';
  if (rating < 1600) return 'Average Enjoyer';
  if (rating < 1800) return 'Main Character';
  if (rating < 2000) return 'Elite Risitas';
  if (rating < 2200) return 'Absolute Him/Her';
  return 'Legendary Icon';
}

const imgCheck = new Map();

export async function imageWorks(url) {
  if (imgCheck.has(url)) return imgCheck.get(url);
  if (url && url.indexOf('res.cloudinary.com') !== -1) {
    imgCheck.set(url, Promise.resolve(true));
    return true;
  }
  const p = new Promise(resolve => {
    const img = new Image();
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
    const timer = setTimeout(() => finish(false), 4000);
  });
  imgCheck.set(url, p);
  return p;
}

export async function validPhotos(photos, max) {
  const out = [];
  let i = 0;
  const limit = max || photos.length;
  const concurrency = Math.min(12, photos.length);
  if (concurrency === 0) return out;
  const worker = async () => {
    while (i < photos.length && out.length < limit) {
      const p = photos[i++];
      if (await imageWorks(p.image_url)) out.push(p);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

// Pick two contenders from the valid pool (newborn promotion + rating bands).
export function pickPair(valid) {
  const now = Date.now();
  const isNewborn = p => {
    const age = now - Date.parse(p.created_at);
    const games = (p.wins || 0) + (p.losses || 0);
    return age < 72 * 3600 * 1000 || games < 10;
  };
  const newborns = valid.filter(isNewborn);

  let a, b;
  if (newborns.length > 0 && Math.random() < 0.6) {
    a = newborns[Math.floor(Math.random() * newborns.length)];
    const others = valid.filter(p => p.id !== a.id)
      .sort((x, y) => Math.abs(x.rating - a.rating) - Math.abs(y.rating - a.rating));
    b = others[Math.floor(Math.random() * Math.min(others.length, 3))];
  } else if (valid.length > 4 && Math.random() < 0.7) {
    a = valid[Math.floor(Math.random() * valid.length)];
    const band = 120;
    const rivals = valid
      .filter(p => p.id !== a.id && Math.abs(p.rating - a.rating) <= band)
      .sort((x, y) => Math.abs(x.rating - a.rating) - Math.abs(y.rating - a.rating));
    if (rivals.length > 0) b = rivals[Math.floor(Math.random() * Math.min(rivals.length, 3))];
    else {
      const others = valid.filter(p => p.id !== a.id);
      b = others[Math.floor(Math.random() * others.length)];
    }
  } else {
    const i1 = Math.floor(Math.random() * valid.length);
    let i2 = Math.floor(Math.random() * valid.length);
    let guard = 0;
    while (i2 === i1 && guard++ < 50) i2 = Math.floor(Math.random() * valid.length);
    a = valid[i1];
    b = valid[i2];
  }
  return [a, b];
}

// Cloudinary dynamic optimization: converts images on the fly to auto-format (AVIF/WebP),
// auto-quality, and proper display dimensions, cutting transfer sizes by ~80-95%.
export function getOptimizedImageUrl(url, { width = 800, height = null, crop = 'limit', quality = 'auto', format = 'auto' } = {}) {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) {
    return url;
  }
  const parts = url.split('/upload/');
  if (parts.length !== 2) return url;

  const transforms = [`f_${format}`, `q_${quality}`];
  if (width) transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  if (crop && (width || height)) transforms.push(`c_${crop}`);

  const transformStr = transforms.join(',');
  const afterUpload = parts[1];
  const firstSlash = afterUpload.indexOf('/');
  if (firstSlash !== -1) {
    const firstSegment = afterUpload.slice(0, firstSlash);
    if (/^[a-z]_[a-z0-9]+(,[a-z]_[a-z0-9]+)*$/i.test(firstSegment)) {
      return `${parts[0]}/upload/${transformStr}/${afterUpload.slice(firstSlash + 1)}`;
    }
  }

  return `${parts[0]}/upload/${transformStr}/${afterUpload}`;
}

// Downscale + compress in the browser so the Cloudinary upload is small and fast.
export async function compressImage(file, maxEdge = 1200, quality = 0.82) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('Could not read image.'));
    r.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Not a valid image.'));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let blob = await new Promise(res => canvas.toBlob(res, 'image/webp', quality));
  let mimeType = 'image/webp';
  let ext = '.webp';

  if (!blob || blob.size === 0) {
    blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    mimeType = 'image/jpeg';
    ext = '.jpg';
  }

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return {
    blob,
    mimeType,
    name: baseName + ext,
    originalSize: file.size,
    compressedSize: blob.size,
    savedPercent: Math.max(0, Math.round((1 - blob.size / file.size) * 100))
  };
}

export const PERIODS = {
  weekly: { label: 'Weekly', winsCol: 'weekly_wins', ratingCol: 'weekly_rating_start', prize: 'Logitech Mouse' },
  monthly: { label: 'Monthly', winsCol: 'monthly_wins', ratingCol: 'monthly_rating_start', prize: 'Play Store Redeem Code' },
  yearly: { label: 'Yearly', winsCol: 'yearly_wins', ratingCol: 'yearly_rating_start', prize: 'Apple Keyboard + Free Domain' }
};
