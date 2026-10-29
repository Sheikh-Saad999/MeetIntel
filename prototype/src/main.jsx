import React from 'react'
import ReactDOM from 'react-dom/client'
import SaaSRoot from './saas/SaaSRoot.jsx'
import JoinMeeting from './JoinMeeting.jsx'
import './index.css'

// A meeting invite link looks like https://<app>/?join=<room-name> — anyone
// opening it lands on the lightweight guest join screen instead of the app.
const joinRoom = new URLSearchParams(window.location.search).get('join')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {joinRoom ? <JoinMeeting room={joinRoom} /> : <SaaSRoot />}
  </React.StrictMode>,
)
