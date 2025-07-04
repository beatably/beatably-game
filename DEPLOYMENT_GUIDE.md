# Hitster Game Deployment Guide

This guide will walk you through deploying your Hitster game to the web using free hosting services.

## 🎯 Overview

We'll deploy:
- **Frontend** → Netlify (Free tier)
- **Backend** → Render (Free tier)
- **Code** → GitHub (Free)

## 📋 Prerequisites

You'll need accounts for:
1. [GitHub](https://github.com) - Code repository
2. [Render](https://render.com) - Backend hosting
3. [Netlify](https://netlify.com) - Frontend hosting
4. [Spotify Developer](https://developer.spotify.com) - API access

## 🚀 Step-by-Step Deployment

### Step 1: Create GitHub Repository

1. Go to [GitHub](https://github.com) and sign up/login
2. Click "New repository"
3. Name it `hitster-game` (or your preferred name)
4. Make it **Public** (required for free hosting)
5. **Don't** initialize with README (we already have one)
6. Click "Create repository"

### Step 2: Push Code to GitHub

Copy the commands from your new GitHub repository page and run them:

```bash
git remote add origin https://github.com/YOUR_USERNAME/hitster-game.git
git push -u origin main
```

### Step 3: Deploy Backend to Render

1. Go to [Render](https://render.com) and sign up with GitHub
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: `hitster-backend`
   - **Environment**: `Node`
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Instance Type**: `Free`

5. Add Environment Variables:
   - `NODE_ENV` = `production`
   - `SPOTIFY_CLIENT_ID` = `your_spotify_client_id`
   - `SPOTIFY_CLIENT_SECRET` = `your_spotify_client_secret`
   - `SPOTIFY_REDIRECT_URI` = `https://your-netlify-url.netlify.app/callback`
   - `FRONTEND_URI` = `https://your-netlify-url.netlify.app`

6. Click "Create Web Service"

**Note**: Save your Render backend URL (e.g., `https://hitster-backend-xyz.onrender.com`)

### Step 4: Update Frontend Configuration

1. Edit `frontend/src/config.js`
2. Replace `https://your-render-backend-url.onrender.com` with your actual Render URL
3. Commit and push the changes:

```bash
git add frontend/src/config.js
git commit -m "Update backend URL for production"
git push
```

### Step 5: Deploy Frontend to Netlify

1. Go to [Netlify](https://netlify.com) and sign up with GitHub
2. Click "Add new site" → "Import an existing project"
3. Choose GitHub and select your repository
4. Configure build settings:
   - **Build command**: `cd frontend && npm install && npm run build`
   - **Publish directory**: `frontend/dist`
   - **Node version**: `18`

5. Click "Deploy site"

**Note**: Save your Netlify URL (e.g., `https://amazing-name-123456.netlify.app`)

### Step 6: Update Backend CORS Settings

1. Edit `backend/index.js`
2. Replace `https://your-netlify-url.netlify.app` with your actual Netlify URL
3. Also update `backend/.env.production` with the correct URLs
4. Commit and push:

```bash
git add backend/index.js backend/.env.production
git commit -m "Update CORS settings with production URLs"
git push
```

### Step 7: Configure Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app or edit existing one
3. Add these Redirect URIs:
   - `http://127.0.0.1:5173/callback` (for local development)
   - `https://your-netlify-url.netlify.app/callback` (for production)
4. Save settings

### Step 8: Update Environment Variables

Go back to your Render dashboard and update the environment variables with the correct URLs:
- `SPOTIFY_REDIRECT_URI` = `https://your-actual-netlify-url.netlify.app/callback`
- `FRONTEND_URI` = `https://your-actual-netlify-url.netlify.app`

## ✅ Testing Your Deployment

1. Visit your Netlify URL
2. Create a game room
3. Connect Spotify (you'll need Spotify Premium)
4. Test multiplayer by opening the game in multiple browser tabs
5. Verify all features work:
   - Room creation/joining
   - Spotify authentication
   - Music playback
   - Card placement
   - Real-time updates

## 🔧 Troubleshooting

### Common Issues:

**CORS Errors**:
- Check that your Netlify URL is correctly set in backend CORS configuration
- Ensure environment variables are set correctly in Render

**Spotify Authentication Fails**:
- Verify redirect URIs in Spotify app settings
- Check that SPOTIFY_REDIRECT_URI environment variable matches exactly

**Backend Not Responding**:
- Check Render logs for errors
- Verify environment variables are set
- Ensure build completed successfully

**Frontend Build Fails**:
- Check that backend URL in `frontend/src/config.js` is correct
- Verify Node version is 18 in Netlify settings

## 🎉 Success!

Once everything is working, you'll have:
- ✅ Live game URL you can share with friends
- ✅ Automatic deployments when you push code changes
- ✅ Professional hosting setup that can scale
- ✅ Complete version control with Git

## 📝 Next Steps

- Share your game URL with friends to test multiplayer
- Consider adding a custom domain to Netlify
- Monitor usage and upgrade hosting if needed
- Add new features and deploy them automatically

## 🆘 Need Help?

If you encounter issues:
1. Check the logs in Render and Netlify dashboards
2. Verify all URLs and environment variables are correct
3. Test locally first to ensure the code works
4. Check that all services are running and accessible

---

**Your URLs:**
- Frontend: `https://your-netlify-url.netlify.app`
- Backend: `https://your-render-backend-url.onrender.com`
- Repository: `https://github.com/YOUR_USERNAME/hitster-game`
