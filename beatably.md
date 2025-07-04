## Product Requirements Document (PRD)

### 1. Introduction
This document defines the requirements for a web app that digitizes the Beatably board game. The goal is to provide a full-featured digital version that allows users to play Beatably online, replicating all of the game mechanics—including timeline construction, token management, real-time song playback via integration with Spotify, and multiple game modes—while ensuring an intuitive, engaging, and socially interactive experience. The game is designed to be played in the same physical location, with only one player connected to Spotify. All other players hear the music from the same shared source.

### 2. Objectives and Goals
- **Digital Transition:** Enable players to enjoy Beatably without the need for physical game cards, tokens, or any extra accessories.
- **Enhanced Accessibility:** Provide access through a web browser on both desktop and mobile devices.
- **Real-Time Interactivity:** Support multiplayer sessions with synchronous play, including turn management and real-time game updates.
- **Integration with Music Services:** Seamlessly integrate with Spotify (or similar services) to play song snippets corresponding to Beatably's music cards.
- **Scalability:** Develop an architecture that can support both small private games and large public sessions.
- **User Engagement:** Include social interaction features such as competitive tokens, challenges, and in-room collaboration to simulate the in-person game dynamics.

### 3. Product Overview
The digital Beatably web app will reimagine the physical board game as an interactive, web-based platform. It will include several game modes (e.g., Original, Pro, Expert, and Cooperative) and rely on a backend service for game state management, user authentication, and integration with Spotify's API. The product will feature a clean, responsive design with a focus on simplicity and ease of use, ensuring that both new and experienced players can start quickly.

### 5. Features and Functional Requirements
#### 5.1 Gameplay Mechanics
- **Timeline Construction:**
  - *Initial Setup:* At the beginning of the game, one song card should be placed face-up in the timeline, showing its release year. This acts as the reference point for the first guess and should be selected randomly from within the range of years represented in the song pool.
  - *Card Presentation:* Display a digital card with song metadata (and hidden release date) to the active player.
  - *Drag-and-Drop Interface:* Allow players to place the card in the timeline at the position they believe the song fits.
  - *Reveal Logic:* Flip the card to show the actual release year and indicate whether the placement was correct. Song name and artist will also be revealed if the user has attempted to guess this information. If correct, players will collectively agree and allow the guessing player to award themselves a bonus token (via a CTA button).

- **Turn-Based Gameplay:**
  - Implement a system to handle player turns in real time.
  - Highlight the current player's turn with clear UI cues.

- **Token Mechanics:**
  - *Token Allocation:* Provide 3 tokens per player at the game start.
  - *Token Use Cases:*
    - Skip a song by spending a token.
    - Challenge another player's card placement by spending a token.
    - Trade tokens for a free pass that places a card directly into the timeline.
  - *Token Rewards:* Correct identification of song title and artist grants extra tokens. This is managed manually by players and relies on group consensus.

#### 5.2 Music Integration
- **Spotify API Integration:**
  - Use Spotify APIs to stream the respective songs.
  - Playback is only required on the device of the player who created the game.
  - Only Spotify Premium accounts are supported.
  - The game creator logs into their Spotify account during setup.

- **QR Code Alternative:**
  - Instead of QR codes, songs are played using the Spotify API. Metadata and identifiers are displayed on-screen after the card is flipped.

#### 5.3 Multiplayer & Social Features
- **Game Session Management:**
  - *Lobby Creation:* Allow players to create private lobbies with room codes or join public sessions.
  - *Player Invitations:* Enable players to invite friends via links or social media.

- **Real-Time Synchronization:**
  - Ensure all players see real-time updates for card placements, token usage, and score changes.
  - Use WebSockets or a similar low-latency protocol.

#### 5.4 User Account
- **User Registration and Profiles:**
  - No account registration required. Guest play only.

### 6. Non-Functional Requirements
#### 6.1 Performance and Scalability
- Real-time updates should have minimal latency (target <200 ms).
- Backend must support high concurrency.
- Web app must be fully responsive for mobile and desktop.

#### 6.2 Security
- Use secure OAuth authentication for Spotify integration.

#### 6.3 Reliability and Availability
- Ensure 99.9% uptime.
- Include logging and recovery for interrupted sessions.

#### 6.4 Usability
- Intuitive UI with minimal learning curve.
- Meet accessibility standards (WCAG 2.1).
- Support English only for initial release; other languages can be added later.

### 7. User Experience and Interface Design
#### 7.1 Onboarding and Game Setup
- *Landing Page:* Explain the game, show screenshots, and encourage guest play.
- *Lobby Interface:* Clean layout for creating/joining lobbies, with clear instructions.

#### 7.2 Game Interface
- *Main Game Board:* Show the timeline of the current player's turn to all players. Support drag-and-drop placement.
- *Player Dashboard:* Display player tokens, current turn, and score.
- *Music Player:* Embed Spotify player for the game creator.
- *Feedback:* Visual cues for correct/incorrect actions and token changes.

#### 7.3 Post-Game Summary
- Display final stats and game results.

### 8. Technology Stack and Architecture
#### 8.1 Frontend
- JavaScript Framework: React, Vue, or Angular.
- CSS Framework: Tailwind CSS.

#### 8.2 Backend
- Real-time via WebSocket (e.g., Socket.IO).
- APIs: RESTful or GraphQL.
- Database: PostgreSQL or MongoDB.

#### 8.3 Integration Services
- Spotify API for playback and metadata.
- OAuth 2.0 for Spotify login.
- Hosting: AWS, GCP, or Azure.

### 9. Roadmap and Milestones
#### 9.0 Phase 0: Prototyping
- Simulate song playback using fake data before Spotify integration.
- Implement core timeline logic and card placement.



#### 9.1 Phase 1: MVP Development
- Implement full game-logic: score and beatably cards, let other players challenge a player's guess, using a beatably card to get another song to guess at etc.
- Spotify playback integration.

#### 9.2 Phase 2: Feature Enhancements
- Refine UI/UX.
- Add tutorials and player guidance.

#### 9.3 Phase 3: Scalability & Optimization
- Optimize performance and server capacity.
- Cross-platform browser/device testing.

### 10. Testing and Quality Assurance
- Unit tests for frontend and backend logic.
- Integration tests for game flow.
- UAT with closed beta group.
- Performance testing under load.

### 11. Risks and Mitigation Strategies
- **Spotify API Limitations:** Monitor rate limits and licensing. Use caching and fallbacks.
- **Multiplayer Sync Issues:** Implement robust error handling and reconnect logic.
- **Engagement Drop-Off:** Regularly gather feedback and iterate quickly.
