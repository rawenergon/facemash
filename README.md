# FaceMash - Elo Photo Rating Game

Classic 2003 Facemash-style photo battle game with fair Elo scoring, weekly/monthly/yearly rankings, prizes, accounts, guest mode, and a Cloudinary-hosted image pipeline.

## Architecture

- **Backend**: Node/Express server (`server.js`) - the only place secrets live
  - signup/login (bcrypt-hashed passwords in Supabase `users` table)
  - photo upload to **Cloudinary** (API secret is server-side only)
  - rate limiting: **5 uploads/day** per user email (IP for guests)
  - owner-only photo deletion for logged-in users
  - server-enforced fair Elo + upset bonus + streaks + weekly/monthly/yearly counts
- **Frontend**: vanilla HTML/CSS/JS (`index.html`, `rankings.html`, `upload.html`, `styles.css`, `app.js`)
  - dedicated pages: `/` (Photo Battle), `/rankings` (leaderboard), `/upload` (add/manage photos)
  - guest mode or login/signup
  - rating battles, funny prompts, "Fresh Faces" newcomer promotion
  - rankings with Weekly | Monthly | Yearly tabs + prizes
  - Supabase (publishable key) used only for reads
- **Database**: Supabase Postgres (`photos`, `users`, `upload_log`)
- **Images**: Cloudinary (cloud `oe4jcpek`)

## Setup

### 1. Database
The SQL schema (`photos`, `users`, `upload_log`, `winners`) is managed outside this repo. Run it in the Supabase SQL Editor (idempotent; safe to re-run).

### 2. Environment
```powershell
Copy-Item .env.example .env
```
Then edit `.env`:
- `SUPABASE_SERVICE_KEY` = your **service_role** key (Supabase Dashboard > Settings > API Keys)
- `CLOUDINARY_URL` = `cloudinary://<api_key>:<api_secret>@oe4jcpek`
- `JWT_SECRET` = a long random string
- `PORT` = 3000

### 3. Run
```powershell
npm install
npm start
```
Open http://localhost:3000

## Rules / Prizes
- Anyone (guest or logged in) can upload up to **5 photos/day**
- Only logged-in users can delete **their own** photos
- Weekly winner = Logitech Mouse, Monthly = Play Store Redeem Code, Yearly = Apple Keyboard + Free Domain
- Winners email devadibxr@gmail.com to claim (see T&C in footer)

## Schema (core columns)
`photos`: id, name, gender, image_url (Cloudinary), cloudinary_public_id, owner_email, rating, wins, losses, streak, best_streak, weekly/monthly/yearly tracking, created_at
`users`: id, email (unique), name, password_hash
`upload_log`: identity, day, count  (5/day rate limiting)