# Run Database Migration Locally

## Option A: Using Railway Shell (Easiest)

1. Go to Railway Dashboard
2. Click on your **API service** (`par-Noir`)
3. Click **"Deployments"** tab
4. Click on the **latest deployment**
5. Click **"Shell"** or **"Terminal"** button
6. Run:
   ```bash
   node api/scripts/run-migration.js
   ```

## Option B: Using Database GUI Tool

### Step 1: Get Connection String
1. Railway Dashboard → PostgreSQL service
2. Click **"Connect"** or **"Variables"** tab
3. Copy the `DATABASE_URL` value

### Step 2: Connect with Database Tool
Use any PostgreSQL client:
- **pgAdmin** (free, GUI)
- **DBeaver** (free, cross-platform)
- **TablePlus** (Mac, paid/free tier)
- **Postico** (Mac, paid)
- **psql** (command line)

### Step 3: Run Migration
1. Connect to database using the connection string
2. Open `api/migrations/add_enhanced_feed_posts.sql`
3. Execute the SQL script

## Option C: Using psql Command Line

### Step 1: Get Connection String
From Railway Dashboard → PostgreSQL → Connect tab

### Step 2: Extract Connection Details
The `DATABASE_URL` format is:
```
postgresql://user:password@host:port/dbname
```

### Step 3: Run Migration
```bash
# Option 1: Using connection string directly
psql "postgresql://user:password@host:port/dbname" -f api/migrations/add_enhanced_feed_posts.sql

# Option 2: Set environment variable first
export DATABASE_URL="postgresql://user:password@host:port/dbname"
psql $DATABASE_URL -f api/migrations/add_enhanced_feed_posts.sql
```

## Option D: Using Node.js Script Locally

### Step 1: Get DATABASE_URL
From Railway Dashboard → PostgreSQL → Variables tab

### Step 2: Set Environment Variable
```bash
export DATABASE_URL="your_connection_string_here"
```

### Step 3: Run Migration Script
```bash
cd api
node scripts/run-migration.js
```

## Verify Migration Success

After running migration, verify it worked:

```sql
-- Check if new columns exist in feeds table
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'feeds' 
AND column_name IN ('is_paid', 'monthly_price', 'annual_price', 'subdomain');

-- Check if feed_posts table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'feed_posts'
);

-- Check if feed_subscriptions has new columns
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'feed_subscriptions' 
AND column_name IN ('billing_cycle', 'status', 'checkout_id', 'expires_at');
```

## Troubleshooting

### "Connection refused"
- Check if DATABASE_URL is correct
- Verify PostgreSQL service is running in Railway
- Check if IP whitelist allows your connection

### "Permission denied"
- Verify database user has CREATE/ALTER permissions
- Check if tables already exist (migration uses IF NOT EXISTS)

### "Table already exists"
- This is OK! The migration uses `IF NOT EXISTS` clauses
- It will only add columns that don't exist
- Safe to run multiple times

