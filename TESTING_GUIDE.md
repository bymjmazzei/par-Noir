# Testing Guide - Where to Find New Features

## 🎯 Quick Access Guide

### 1. **Gemini AI Integration** ✅
**Location:** Storage Tab → Upload Files

**How to Test:**
1. Go to **Storage** tab (in main navigation)
2. Click **"Upload Files"** or drag & drop files
3. Upload an image or file
4. **What to look for:**
   - Check browser console for: `✅ [uploadFile] Gemini AI enriched metadata`
   - Metadata should be auto-generated (tags, description, categories)
   - Content rating should be set automatically

**Expected Behavior:**
- Files are checked by Gemini AI before upload
- Metadata is automatically enriched with tags and descriptions
- NSFW content is flagged automatically

---

### 2. **Reporting System** ✅
**Location:** Storage Tab → Media Tiles → Kebab Menu (⋮)

**How to Test:**
1. Go to **Storage** tab
2. Find any media tile (image/video)
3. Look for the **⋮ (three dots)** menu in the **top left corner** of the tile caption area
4. Click the menu → Select **"Report as NSFW"**
5. Fill out the report form and submit

**Expected Behavior:**
- Report modal opens
- You can select report type (NSFW, Spam, Copyright, Other)
- After 5 reports, content auto-escalates to NSFW rating
- Owner gets notified

---

### 3. **API Key Activation (Developer Portal)** ✅
**Location:** Developer Tab

**How to Test:**
1. Click **"Developer"** tab in main navigation
2. Look for **"API Key"** or **"Developer API Access"** section
3. Click to view your API key
4. Click **"Activate API Key"** (if inactive)
5. Complete identity verification (Veriff)

**Expected Behavior:**
- API key is displayed
- Status shows "Active" or "Inactive"
- Activation requires identity verification
- After activation, API key can be used for OAuth and data points

---

### 4. **Feed System** ⚠️ (May need navigation links added)

**Feed Discovery:**
- Component exists: `FeedDiscovery.tsx`
- **Currently:** Not linked in navigation (needs to be added)
- **To test:** Would need to manually navigate or add link

**Feed Creator:**
- Component exists: `FeedCreator.tsx`
- **Currently:** Not linked in navigation (needs to be added)
- **To test:** Would need to manually navigate or add link

**Feed Page:**
- Component exists: `FeedPage.tsx`
- **Currently:** Not linked in navigation (needs routing)
- **To test:** Would need routing setup

**What's Missing:**
- Navigation links to Feed Discovery
- Button/link to create new feed
- Routing for Feed Page

---

### 5. **Enhanced Thought Creator** ✅
**Location:** Feed Creator (when accessible)

**How to Test:**
1. Access Feed Creator (needs navigation link)
2. Create a new feed
3. When creating top post, you'll see:
   - Rich text editor
   - Media upload (images/videos)
   - Button creator
   - Poll creator
   - Form builder

**Expected Behavior:**
- Rich text editing with formatting
- Add multiple media items
- Create interactive buttons
- Add polls with voting
- Create forms

---

## 🔧 Quick Fixes Needed

### Add Feed Navigation Links

The feed features exist but aren't accessible via navigation. Here's what needs to be added:

1. **Add "Feeds" tab** to main navigation
2. **Add "Discover Feeds" link** → Opens FeedDiscovery
3. **Add "Create Feed" button** → Opens FeedCreator
4. **Add routing** for FeedPage (`/feed/:feedId`)

---

## 📍 Current Navigation Tabs

Based on `App.tsx`, current tabs are:
- Privacy
- Delegation  
- Recovery
- Storage ✅ (Gemini AI & Reporting here)
- Developer ✅ (API Keys here)

**Missing:** Feeds tab

---

## 🧪 Testing Checklist

### Gemini AI
- [ ] Upload an image → Check console for Gemini logs
- [ ] Upload NSFW content → Verify auto-flagging
- [ ] Check metadata enrichment → Tags/description added

### Reporting
- [ ] Open media tile menu → See "Report as NSFW" option
- [ ] Submit report → Verify success message
- [ ] Check report count → Should increment
- [ ] Test auto-escalation → 5 reports → NSFW rating

### API Keys
- [ ] Go to Developer tab → See API key
- [ ] Check activation status
- [ ] Test activation flow (if inactive)

### Feeds
- [ ] ⚠️ **Needs navigation links first**
- [ ] Once accessible: Create feed
- [ ] Once accessible: Discover feeds
- [ ] Once accessible: View feed page

---

## 🚀 Next Steps

1. **Add Feed Navigation** - Make feeds accessible
2. **Test Gemini AI** - Upload files in Storage tab
3. **Test Reporting** - Use kebab menu in Storage tab
4. **Test API Keys** - Go to Developer tab

Would you like me to add the Feed navigation links so you can test the feed features?

