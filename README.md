# HorecaStore Project360 — Horeca Store Project Tracking System

Full-stack project tracking system for Horeca Store USA & UAE.

## Features
- **Admin (CEO) view** — full financials, margins, all project data
- **Team view** — update item status, location, BOL, tracking
- **Client portal** — live shareable link per project (no login needed)
- **AI upsell** — suggests missing equipment based on cuisine type
- **PostgreSQL** — all data persisted in production database

---

## Deploy on Render (5 minutes)

### Step 1 — Add your logo
Place your logo file as `public/logo.jpg` before deploying.

### Step 2 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial HorecaStore Project360"
git remote add origin https://github.com/YOUR_USERNAME/horeca-track.git
git push -u origin main
```

### Step 3 — Deploy on Render
1. Go to [render.com](https://render.com) and sign up/login
2. Click **New +** → **Blueprint**
3. Connect your GitHub repo
4. Render reads `render.yaml` automatically and creates:
   - A **Web Service** (Node.js app)
   - A **PostgreSQL database**

### Step 4 — Set Environment Variables
In Render dashboard → your web service → **Environment**:

| Key | Value |
|-----|-------|
| `ADMIN_PASSWORD` | Your secure CEO password |
| `TEAM_PASSWORD` | Your team's shared password |
| `JWT_SECRET` | Auto-generated (already set by render.yaml) |
| `DATABASE_URL` | Auto-set by render.yaml |

### Step 5 — Done!
Your app will be live at: `https://horeca-track.onrender.com`

---

## Usage

### Sharing with clients
1. Open the project in the admin dashboard
2. Click **📤 Share with Client**
3. Copy the link — e.g. `https://horeca-track.onrender.com/portal/agas-catering-1234`
4. Email it to your client — they see live updates with no login

### Roles
- **Admin password** → CEO view (all financials, margins, add/edit/delete)
- **Team password** → Team view (update status, location, BOL only)
- **Client portal** → Public URL, no password, no cost data shown

---

## Local Development

```bash
# 1. Copy env file
cp .env.example .env
# Edit .env with your PostgreSQL connection string

# 2. Install
npm install

# 3. Run
npm run dev

# App at http://localhost:3000
```

---

## Tech Stack
- **Backend**: Node.js + Express
- **Database**: PostgreSQL (via `pg`)
- **Auth**: JWT tokens
- **Frontend**: Vanilla JS (no build step)
- **AI**: Anthropic Claude API (in client portal)
