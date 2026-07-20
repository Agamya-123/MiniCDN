import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import MapSimulator from './components/MapSimulator.jsx';
import AdminUpload from './components/AdminUpload.jsx';
import AnalyticsTable from './components/AnalyticsTable.jsx';
import AuthModal from './components/AuthModal.jsx';
import axios from 'axios';

export default function App() {
  const [activeTab, setActiveTab] = useState('simulator');
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Check current auth status on load
  useEffect(() => {
    if (token) {
      axios.get('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(res => {
        setUser(res.data.user);
      }).catch(() => {
        localStorage.removeItem('token');
        setToken('');
        setUser(null);
      });
    }
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUser(null);
    if (activeTab === 'upload') setActiveTab('simulator');
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 16px 40px 16px' }}>
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
      />

      <main>
        {activeTab === 'simulator' && <MapSimulator />}
        {activeTab === 'upload' && user && user.role === 'admin' && (
          <AdminUpload token={token} onUploadSuccess={() => {}} />
        )}
        {activeTab === 'analytics' && <AnalyticsTable token={token} user={user} />}
      </main>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={(userData, userToken) => {
          setUser(userData);
          setToken(userToken);
        }}
      />
    </div>
  );
}
