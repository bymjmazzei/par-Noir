# Where to Do What - Location Guide

## 📍 Current Location
You're currently in: `/Users/gamit/pages/par-Noir` (project root)

This is correct! You'll run commands from here or navigate to subdirectories as needed.

---

## 🗂️ Project Structure

```
/Users/gamit/pages/par-Noir/          ← You are here (project root)
├── api/                               ← Backend API server
│   ├── .env                           ← Backend environment variables (create if needed)
│   ├── migrations/
│   │   └── add_enhanced_feed_posts.sql ← Database migration file
│   └── src/server.ts                  ← Backend server code
├── apps/
│   └── id-dashboard/                  ← Frontend dashboard
│       ├── .env                       ← Frontend environment variables (create if needed)
│       └── src/                       ← Frontend source code
└── DEPLOYMENT_CHECKLIST.md            ← Full deployment guide
```

---

## ✅ Step-by-Step: Where to Do Each Task

### 1. Database Migration

**Location:** Run from project root OR directly connect to your database

**Option A: From project root**
```bash
# You're already here: /Users/gamit/pages/par-Noir
psql -U your_username -d your_database_name -f api/migrations/add_enhanced_feed_posts.sql
```

**Option B: Connect to database first**
```bash
# From project root
psql -U your_username -d your_database_name

# Then inside psql:
\i api/migrations/add_enhanced_feed_posts.sql
```

**Option C: Using a database GUI tool**
- Open your database management tool (pgAdmin, DBeaver, TablePlus, etc.)
- Connect to your database
- Open and execute: `api/migrations/add_enhanced_feed_posts.sql`

---

### 2. Frontend Environment Variables

**Location:** `apps/id-dashboard/.env`

**Steps:**
```bash
# From project root
cd apps/id-dashboard

# Check if .env exists
ls -la .env

# If it doesn't exist, create it:
touch .env

# Edit it (use your preferred editor)
nano .env
# or
code .env
# or
vim .env
```

**Add these lines:**
```bash
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_API_ENDPOINT=https://api.parnoir.com
VITE_SUBDOMAIN_DOMAIN=parnoir.com
```

**Then go back to project root:**
```bash
cd ../..
```

---

### 3. Backend Environment Variables

**Location:** `api/.env`

**Steps:**
```bash
# From project root
cd api

# Check if .env exists
ls -la .env

# If it doesn't exist, create it:
touch .env

# Edit it
nano .env
# or
code .env
```

**Add these lines:**
```bash
COINBASE_WEBHOOK_SECRET=your_webhook_secret
COINBASE_COMMERCE_API_KEY=your_coinbase_api_key
API_BASE_URL=https://api.parnoir.com
```

**Then go back to project root:**
```bash
cd ..
```

---

### 4. Get Gemini API Key

**Location:** Web browser (https://aistudio.google.com/)

**Steps:**
1. Open browser → https://aistudio.google.com/
2. Sign in with Google account
3. Click "Get API Key" → "Create API Key"
4. Copy the key
5. Paste it into `apps/id-dashboard/.env` as `VITE_GEMINI_API_KEY`

---

### 5. Set Up Coinbase Commerce Webhook

**Location:** Web browser (Coinbase Commerce Dashboard)

**Steps:**
1. Open browser → Coinbase Commerce Dashboard
2. Go to Settings → Webhooks
3. Add webhook URL: `https://api.parnoir.com/api/webhooks/coinbase`
4. Copy the webhook secret
5. Paste it into `api/.env` as `COINBASE_WEBHOOK_SECRET`

---

### 6. Test Locally

**Location:** Project root

**Start Backend:**
```bash
# From project root
cd api
npm run dev
# or
npm start
```

**Start Frontend (in another terminal):**
```bash
# From project root
cd apps/id-dashboard
npm run dev
```

**Then:**
- Open browser to frontend URL (usually http://localhost:5173)
- Test creating feeds, subscriptions, etc.

---

### 7. Build for Production

**Build Frontend:**
```bash
# From project root
cd apps/id-dashboard
npm run build
# Output will be in apps/id-dashboard/dist/
```

**Build Backend:**
```bash
# From project root
cd api
npm run build
# Output will be in api/dist/
```

---

## 🎯 Quick Reference: File Locations

| Task | File/Directory | Full Path |
|------|---------------|-----------|
| Database migration | `api/migrations/add_enhanced_feed_posts.sql` | `/Users/gamit/pages/par-Noir/api/migrations/add_enhanced_feed_posts.sql` |
| Frontend .env | `apps/id-dashboard/.env` | `/Users/gamit/pages/par-Noir/apps/id-dashboard/.env` |
| Backend .env | `api/.env` | `/Users/gamit/pages/par-Noir/api/.env` |
| Frontend code | `apps/id-dashboard/src/` | `/Users/gamit/pages/par-Noir/apps/id-dashboard/src/` |
| Backend code | `api/src/` | `/Users/gamit/pages/par-Noir/api/src/` |

---

## 💡 Pro Tips

1. **Always start from project root** (`/Users/gamit/pages/par-Noir`)
2. **Use relative paths** - `cd api` or `cd apps/id-dashboard`
3. **Check current directory** - Run `pwd` to see where you are
4. **Navigate back** - Use `cd ..` to go up one level, `cd ../..` to go up two levels

---

## 🚨 Common Mistakes

❌ **Don't:** Run commands from wrong directory
✅ **Do:** Check `pwd` first, navigate to correct directory

❌ **Don't:** Edit `.env` files in wrong location
✅ **Do:** Make sure you're editing `apps/id-dashboard/.env` for frontend, `api/.env` for backend

❌ **Don't:** Run migration on wrong database
✅ **Do:** Double-check database name before running migration

---

## 📞 Need Help?

If you're unsure where you are:
```bash
pwd                    # Shows current directory
ls -la                 # Lists files in current directory
cd /Users/gamit/pages/par-Noir  # Go back to project root
```

