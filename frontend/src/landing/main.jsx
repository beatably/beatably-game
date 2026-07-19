import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import './landing.css';
import LandingPage from './LandingPage';

ReactDOM.createRoot(document.getElementById('landing-root')).render(
  <React.StrictMode>
    <LandingPage />
  </React.StrictMode>
);
