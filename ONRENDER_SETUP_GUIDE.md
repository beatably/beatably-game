# Onrender Configuration Guide - Step by Step

## 🎯 How to Update Environment Variables on Onrender

### Step 1: Click on Your Backend Service
From your current screen (the dashboard), click on **"beatably-backend"** in the list of services.

![You're here - click on beatably-backend](screenshot-reference)

### Step 2: Navigate to Environment Section
Once you're on the service page, you'll see a left sidebar with several options:
1. Look for the left sidebar menu
2. Click on **"Environment"** (it should be one of the menu items)

Alternative navigation: Look for tabs at the top that might include "Environment" or "Environment Variables"

### Step 3: Find the FRONTEND_URI Variable
In the Environment section, you'll see a list of your environment variables:
- Scroll through the list to find `FRONTEND_URI`
- It should currently show: `https://beatably-frontend.netlify.app`

### Step 4: Edit the Variable
1. Click on the **pencil/edit icon** next to `FRONTEND_URI`
2. Change the value from:
   ```
   https://beatably-frontend.netlify.app
   ```
   to:
   ```
   https://beatably.app
   ```
3. Click **"Save"** or **"Update"**

### Step 5: Redeploy (Optional)
Onrender might ask if you want to redeploy. You can:
- **Option A**: Let it auto-deploy when you push your code changes to GitHub
- **Option B**: Manually trigger a deploy now by clicking "Manual Deploy" → "Deploy latest commit"

---

## 📝 Complete Environment Variables Checklist

While you're in the Environment section, verify these are all set:

| Variable Name | Value | Notes |
|--------------|-------|-------|
| `NODE_ENV` | `production` | Should already be set |
| `FRONTEND_URI` | `https://beatably.app` | **← UPDATE THIS** |
| `SPOTIFY_CLIENT_ID` | `[your-client-id]` | Should already be set |
| `SPOTIFY_CLIENT_SECRET` | `[your-secret]` | Should already be set |
| `SPOTIFY_REDIRECT_URI` | `https://beatably-backend.onrender.com/callback` | Should already be set |
| `ADMIN_PASSWORD` | `[your-password]` | Should already be set |

---

## 🚀 Alternative: No Need to Change FRONTEND_URI!

**IMPORTANT**: Actually, you don't *have* to change `FRONTEND_URI` at all!

The code changes I made already whitelist both domains:
- ✅ `https://beatably.app` (your new custom domain)
- ✅ `https://beatably-frontend.netlify.app` (your old domain)

So the app will work regardless of what `FRONTEND_URI` is set to.

**Recommendation**: 
- If you want to keep things simple, **don't change FRONTEND_URI**
- Just push the code changes to GitHub and let Onrender auto-deploy
- The app will work on both domains

---

## 📸 Visual Reference - What You're Looking For

### In the left sidebar, you should see:
```
Dashboard
Logs
Metrics
Settings
Events
Environment    ← CLICK HERE
```

### Or in tabs at the top:
```
Overview | Logs | Metrics | Settings | Environment ← CLICK HERE
```

### The Environment page will look like:
```
Environment Variables

+ Add Environment Variable

[Search environment variables...]

Key                      Value                                    [Actions]
─────────────────────────────────────────────────────────────────────────
NODE_ENV                 production                               [Edit] [Delete]
FRONTEND_URI             https://beatably-frontend.netlify.app    [Edit] [Delete]  ← EDIT THIS ONE
SPOTIFY_CLIENT_ID        ***************************              [Edit] [Delete]
SPOTIFY_CLIENT_SECRET    ***************************              [Edit] [Delete]
...
```

---

## ⚡ Quick Summary

### If you want to update the environment variable:
1. Click **"beatably-backend"** from dashboard
2. Click **"Environment"** in sidebar/tabs
3. Find **"FRONTEND_URI"**
4. Click **"Edit"** (pencil icon)
5. Change to `https://beatably.app`
6. Click **"Save"**

### If you want to skip this step:
- Just push your code changes to GitHub
- Onrender will auto-deploy
- Everything will work because both domains are whitelisted in the code

---

## 🆘 Can't Find Environment Section?

If you can't find the Environment section, try:

1. **From the service page**, look for these sections in order:
   - "Settings" tab → scroll down to "Environment Variables"
   - "Environment" in the left sidebar
   - "Variables" or "Env Vars" tab

2. **Still can't find it?** You can skip this step entirely! The code changes I made are sufficient - just deploy those.

---

## ✅ What Happens Next

After updating (or skipping) the environment variable:

1. **Commit and push** your code changes:
   ```bash
   git add backend/index.js CUSTOM_DOMAIN_DEPLOYMENT_GUIDE.md
   git commit -m "Add CORS support for custom domain beatably.app"
   git push origin main
   ```

2. **Onrender auto-deploys** (watch the "Deploying" status in your dashboard)

3. **Test at** https://beatably.app

4. **Done!** Your custom domain should work perfectly.

---

Last Updated: October 16, 2025
