import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import LandingPage from './components/auth/LandingPage.jsx';
import AuthGate from './components/auth/AuthGate.jsx';
import AppLayout from './components/layout/AppLayout.jsx';

function AppContent() {
  const { user, isReady } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  if (!isReady) {
    return (
      <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:'16px'}}>
        <img src="/logo-mark.svg" alt="INVEX" width="64" height="64" style={{borderRadius:'16px', animation:'pulse 1.5s ease-in-out infinite'}} />
        <div style={{color:'var(--text-muted)', fontSize:'14px'}}>INVEX 로딩 중...</div>
      </div>
    );
  }

  if (!user) {
    if (showAuth) {
      return <AuthGate onBack={() => setShowAuth(false)} />;
    }
    return <LandingPage onShowAuth={() => setShowAuth(true)} />;
  }

  return <AppLayout />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
