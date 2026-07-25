import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import './landing.css';
import LandingPage from './LandingPage';
import { trackPageview } from '../utils/track';

trackPageview('landing');

ReactDOM.createRoot(document.getElementById('landing-root')).render(
  <React.StrictMode>
    <LandingPage />
  </React.StrictMode>
);
