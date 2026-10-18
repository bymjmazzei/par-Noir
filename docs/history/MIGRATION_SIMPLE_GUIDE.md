# Simple Migration Guide - 3 Easy Options

## ✅ Option 1: Database GUI Tool (Easiest - Recommended)

### Step 1: Install a Database Tool
Choose one (all free):
- **DBeaver** (recommended): https://dbeaver.io/download/
- **TablePlus**: https://tableplus.com/ (Mac/Windows)
- **pgAdmin**: https://www.pgadmin.org/download/

### Step 2: Connect to Railway Database
1. Open your database tool
2. Create new PostgreSQL connection
3. Use these connection details from your Railway URL:
   ```
   Host: postgres.railway.internal (or use public hostname if available)
   Port: 5432
   Database: railway
   Username: postgres
   Password: kGZeffnkFeILHWDtQGmaFQxgsQeRkyUq
   ```

   **Note**: If `postgres.railway.internal` doesn't work, check Railway Dashboard → PostgreSQL → "Connect" tab for public hostname

### Step 3: Run Migration
1. In your database tool, open a new SQL query window
2. Open the file: `api/migrations/add_enhanced_feed_posts.sql`
3. Copy all the SQL
4. Paste into query window
5. Execute/Run the query

**Done!** ✅

---

## ✅ Option 2: Admin API Endpoint (Just Created)

I've added a temporary admin endpoint you can call via HTTP:

### Step 1: Set Migration Secret (Optional)
In Railway Dashboard → API Service → Variables:
- Key: `MIGRATION_SECRET`
- Value: `your-secret-here` (or use default: `temporary-secret-change-me`)

### Step 2: Call the Endpoint
```bash
curl -X POST https://api.parnoir.com/api/admin/run-migration \
  -H "x-migration-secret: temporary-secret-change-me"
```

Or use Postman/Insomnia:
- Method: POST
- URL: `https://api.parnoir.com/api/admin/run-migration`
- Header: `x-migration-secret: temporary-secret-change-me`

**Note**: After migration, we should remove this endpoint for security.

---

## ✅ Option 3: Run Locally with psql

### Step 1: Install PostgreSQL Client
```bash
# Mac (Homebrew)
brew install postgresql

# Or download from: https://www.postgresql.org/download/
```

### Step 2: Run Migration
```bash
cd /Users/gamit/pages/par-Noir

# Replace with your actual connection details
psql "postgresql://postgres:kGZeffnkFeILHWDtQGmaFQxgsQeRkyUq@postgres.railway.internal:5432/railway" -f api/migrations/add_enhanced_feed_posts.sql
```

**Note**: `postgres.railway.internal` only works from Railway's network. You'll need the public hostname from Railway Dashboard → PostgreSQL → Connect tab.

---

## 🎯 Recommended: Option 1 (Database GUI)

It's the easiest and most visual way to run the migration. DBeaver is free and works great!

---

## ✅ Verify Migration Worked

After running migration, check if new columns exist:

```sql
-- Check feeds table
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'feeds' 
AND column_name IN ('is_paid', 'monthly_price', 'annual_price', 'subdomain');

-- Should return 4 rows

-- Check feed_posts table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'feed_posts'
);

-- Should return true
```

