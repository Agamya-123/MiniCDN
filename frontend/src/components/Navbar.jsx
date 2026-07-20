import React from 'react';
import { Server, Activity, UploadCloud, LogIn, LogOut, ShieldAlert, Zap } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, user, onOpenAuth, onLogout }) {
  return (
    <header className="glass-panel" style={{ borderRadius: '0 0 16px 16px', margin: '0 0 24px 0', padding: '16px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
            padding: '10px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(56, 189, 248, 0.4)'
          }}>
            <Server size={24} color="#ffffff" />
          </div>
          <div>
            <h1 className="title-gradient" style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              MiniCDN
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Distributed Edge Network Simulator
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', gap: '8px', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`btn ${activeTab === 'simulator' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Zap size={16} /> Geo Routing Simulator
          </button>

          {user && user.role === 'admin' && (
            <button
              onClick={() => setActiveTab('upload')}
              className={`btn ${activeTab === 'upload' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              <UploadCloud size={16} /> Admin Upload
            </button>
          )}

          <button
            onClick={() => setActiveTab('analytics')}
            className={`btn ${activeTab === 'analytics' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Activity size={16} /> Logs & Analytics
          </button>
        </nav>

        {/* User Account Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user.name}</div>
                <span className={`badge ${user.role === 'admin' ? 'badge-purple' : 'badge-info'}`}>
                  {user.role === 'admin' && <ShieldAlert size={10} />} {user.role.toUpperCase()}
                </span>
              </div>
              <button onClick={onLogout} className="btn btn-outline-danger" style={{ padding: '8px 12px' }} title="Logout">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button onClick={onOpenAuth} className="btn btn-primary" style={{ padding: '8px 18px' }}>
              <LogIn size={16} /> Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
