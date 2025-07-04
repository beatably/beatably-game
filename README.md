# Hitster - Digital Music Timeline Game

A web-based multiplayer version of the popular Hitster board game. Players guess where songs fit chronologically in a timeline, with real-time Spotify integration for music playback.

## 🎮 Game Features

- **Multiplayer Real-time Gameplay** - Up to 8 players per room
- **Spotify Integration** - Real music playback with Spotify Premium
- **Timeline Mechanics** - Drag and drop cards to build your music timeline
- **Challenge System** - Players can challenge each other's placements
- **Token System** - Strategic token usage for skips and challenges
- **Song Guessing** - Bonus points for identifying song titles and artists

## 🚀 Live Demo

**Frontend**: [Your Netlify URL will go here]
**Backend**: [Your Render URL will go here]

## 🛠 Tech Stack

- **Frontend**: React, Vite, Socket.IO Client, React DnD, Tailwind CSS
- **Backend**: Node.js, Express, Socket.IO, Spotify Web API
- **Deployment**: Netlify (Frontend) + Render (Backend)

## 🏗 Local Development

### Prerequisites
- Node.js 16+ 
- Spotify Premium account
- Spotify Developer App credentials

### Setup

1. **Clone the repository**
   ```bash
   git clone [your-repo-url]
   cd hitster-game
   ```

2. **Install dependencies**
   ```bash
   # Backend
   cd backend
   npm install
   
   # Frontend
   cd ../frontend
   npm install
   ```

3. **Environment Setup**
   ```bash
   # Copy environment template
   cp backend/.env.example backend/.env
   ```
   
   Fill in your Spotify credentials in `backend/.env`:
   ```
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback
   FRONTEND_URI=http://127.0.0.1:5173
   ```

4. **Start Development Servers**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev
   
   # Terminal 2 - Frontend  
   cd frontend
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://127.0.0.1:5173`

## 🌐 Deployment

This project is configured for deployment on:
- **Frontend**: Netlify (Free tier)
- **Backend**: Render (Free tier)

### Deployment Steps

1. **Create accounts** (if you haven't already):
   - [GitHub](https://github.com)
   - [Netlify](https://netlify.com) 
   - [Render](https://render.com)

2. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin [your-github-repo-url]
   git push -u origin main
   ```

3. **Deploy Backend to Render**:
   - Connect your GitHub repo
   - Set build command: `cd backend && npm install`
   - Set start command: `cd backend && npm start`
   - Add environment variables

4. **Deploy Frontend to Netlify**:
   - Connect your GitHub repo
   - Set build command: `cd frontend && npm run build`
   - Set publish directory: `frontend/dist`

5. **Update Spotify App Settings**:
   - Add production redirect URI
   - Update CORS settings

## 🎵 Spotify Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add redirect URIs:
   - Local: `http://127.0.0.1:5173/callback`
   - Production: `https://your-netlify-url.netlify.app/callback`
4. Copy Client ID and Client Secret to your environment variables

## 🎯 How to Play

1. **Create a Room**: One player creates a game room and connects their Spotify Premium account
2. **Join Players**: Other players join using the room code
3. **Listen & Guess**: Players listen to song snippets and place them in chronological order
4. **Challenge**: Players can challenge each other's placements using tokens
5. **Win**: First player to build a timeline of 10 songs wins!

## 🔧 Configuration

### Environment Variables

**Backend (.env)**:
```
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=your_redirect_uri
FRONTEND_URI=your_frontend_url
PORT=3001
```

### Build Commands

**Frontend**:
- Build: `npm run build`
- Preview: `npm run preview`

**Backend**:
- Start: `npm start`
- Development: `npm run dev`

## 📝 License

This project is for educational and personal use. Spotify integration requires compliance with Spotify's Terms of Service.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 🐛 Issues

If you encounter any issues, please create an issue on GitHub with:
- Description of the problem
- Steps to reproduce
- Browser and device information
