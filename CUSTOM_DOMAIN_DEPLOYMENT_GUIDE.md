# Custom Domain Deployment Guide for beatably.app

## Overview
This guide covers the changes needed to make your app work with the custom domain `beatably.app` on Netlify.

## ✅ Changes Made to Backend Code

### 1. Updated CORS Configuration
**File: `backend/index.js`**

Added your custom domains to the CORS whitelist:
```javascript
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? [
        process.env.FRONTEND_URI, 
        'https://beatably-frontend.netlify.app',
        'https://beatably.app',           // ← NEW
        'https://www.beatably.app'       // ← NEW
      ].filter(Boolean)
    : ['http://127.0.0.1:5173', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret']
};
```

### 2. Updated Socket.io CORS
Also updated the Socket.io server to accept connections from your custom domain:
```javascript
const io = new Server(server, { 
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [
          process.env.FRONTEND_URI, 
          'https://beatably-frontend.netlify.app',
          'https://beatably.app',           // ← NEW
          'https://www.beatably.app'       // ← NEW
        ].filter(Boolean)
      : ['http://127.0.0.1:5173', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST']
  }
});
```

## 🔧 Required Changes on Onrender

### Step 1: Update Environment Variable (Optional but Recommended)
1. Go to your Onrender dashboard: https://dashboard.render.com
2. Navigate to your backend service
3. Go to "Environment" section
4. Update the `FRONTEND_URI` environment variable:
   - **Old value**: `https://beatably-frontend.netlify.app`
   - **New value**: `https://beatably.app`
5. Click "Save Changes"

**Note**: The old Netlify subdomain will still work since we kept it in the CORS list for backward compatibility.

### Step 2: Deploy the Updated Backend
1. After committing the changes to `backend/index.js`, push to your GitHub repository
2. Onrender should automatically trigger a new deployment
3. Wait for the deployment to complete (usually 2-5 minutes)
4. Check the deployment logs to ensure there are no errors

### Step 3: Verify Environment Variables
Ensure these environment variables are set on Onrender:
- ✅ `NODE_ENV=production`
- ✅ `FRONTEND_URI=https://beatably.app`
- ✅ `SPOTIFY_CLIENT_ID=<your-client-id>`
- ✅ `SPOTIFY_CLIENT_SECRET=<your-client-secret>`
- ✅ `SPOTIFY_REDIRECT_URI=https://beatably-backend.onrender.com/callback`
- ✅ `ADMIN_PASSWORD=<your-admin-password>`

## ✅ Netlify Configuration (Already Done)

Based on your screenshot, you've already configured:
- ✅ Primary domain: `www.beatably.app`
- ✅ Domain alias: `beatably.app` (redirects to primary)
- ✅ SSL/TLS certificate: Let's Encrypt (active)
- ✅ Netlify subdomain: `beatably-frontend.netlify.app` (kept as backup)

## 🧪 Testing Your Deployment

### Test 1: Check Backend CORS
```bash
curl -H "Origin: https://beatably.app" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://beatably-backend.onrender.com/api/feature-flags \
     -v
```

**Expected result**: Should see `Access-Control-Allow-Origin: https://beatably.app` in response headers.

### Test 2: Access the App
1. Open https://beatably.app in your browser
2. Create a new game
3. Check browser console for any CORS errors
4. Try to start a game and verify real-time communication works

### Test 3: Check Socket.io Connection
Open browser console on https://beatably.app and look for:
- ✅ WebSocket connection established
- ❌ No CORS errors
- ✅ Socket events working (lobby updates, game state, etc.)

## 🐛 Troubleshooting

### Issue: "CORS policy: No 'Access-Control-Allow-Origin' header"
**Solution**: 
1. Verify backend has been redeployed with the updated CORS configuration
2. Check Onrender deployment logs for any startup errors
3. Clear browser cache and cookies
4. Try in incognito mode

### Issue: "Socket.io connection failed"
**Solution**:
1. Check browser console for specific error messages
2. Verify the backend is running: https://beatably-backend.onrender.com
3. Test the Socket.io endpoint directly
4. Ensure firewall isn't blocking WebSocket connections

### Issue: "Spotify authentication not working"
**Solution**:
1. Verify `SPOTIFY_REDIRECT_URI` on Onrender matches your Spotify Dashboard
2. Check that Spotify Dashboard includes your custom domain in redirect URIs
3. Test OAuth flow manually

### Issue: SSL Certificate Warning
**Solution**:
1. Wait for Netlify to fully provision the Let's Encrypt certificate
2. This can take up to 24 hours after domain configuration
3. Check Netlify domain settings for certificate status

## 📝 Commit and Deploy Checklist

- [x] Updated CORS configuration in `backend/index.js`
- [ ] Commit changes to git
- [ ] Push to GitHub repository
- [ ] Wait for Onrender auto-deployment
- [ ] Update `FRONTEND_URI` env var on Onrender (optional)
- [ ] Test the app at https://beatably.app
- [ ] Verify no CORS errors in browser console
- [ ] Test game creation and real-time updates
- [ ] Test Spotify authentication

## 🚀 Next Steps

1. **Commit the backend changes**:
   ```bash
   git add backend/index.js
   git commit -m "Add CORS support for custom domain beatably.app"
   git push origin main
   ```

2. **Monitor Onrender deployment**:
   - Check deployment logs for errors
   - Verify service restarts successfully

3. **Test thoroughly**:
   - Create a game on https://beatably.app
   - Test with multiple players
   - Verify all features work (Spotify playback, challenges, etc.)

4. **Update documentation**:
   - Update README.md with the new primary domain
   - Update any hardcoded URLs in the codebase

## 🔐 Security Notes

- Both `beatably.app` and `beatably-frontend.netlify.app` are whitelisted for backward compatibility
- All connections use HTTPS with valid SSL certificates
- Credentials are properly handled across origins
- CORS is restricted to specific domains (not wildcard `*`)

## 📞 Support

If you encounter any issues:
1. Check the browser console for specific error messages
2. Review Onrender deployment logs
3. Verify all environment variables are set correctly
4. Test with the old Netlify subdomain to isolate the issue

---

**Last Updated**: October 16, 2025
**Status**: Backend updated, ready for deployment
