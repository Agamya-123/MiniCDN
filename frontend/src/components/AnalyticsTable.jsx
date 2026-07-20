import React, { useState, useEffect } from 'react';
import { Activity, Server, Gauge, CheckCircle2, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import axios from 'axios';

export default function AnalyticsTable({ token, user }) {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({ total_requests: 0, cache_hits: 0, hit_rate_percent: 0, avg_latency_ms: 0 });
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const [logsRes, edgesRes] = await Promise.all([
        axios.get('/api/logs'),
        axios.get('/api/edges')
      ]);
      setLogs(logsRes.data.logs || []);
      setSummary(logsRes.data.summary || {});
      setEdges(edgesRes.data.edges || []);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 5000); // Auto refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const handlePurgeEdge = async (edgeName) => {
    if (!token) {
      alert('Admin login required to purge edge caches');
      return;
    }
    try {
      await axios.post('/api/edges/purge', { edgeName }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      alert(`Purged cache for ${edgeName || 'all edges'}`);
      fetchAnalytics();
    } catch (err) {
      alert('Purge failed');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Metrics Summary Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Requests</span>
            <Activity size={18} color="var(--primary)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{summary.total_requests}</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cache Hit Rate</span>
            <CheckCircle2 size={18} color="var(--accent-emerald)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>{summary.hit_rate_percent}%</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{summary.cache_hits} hits</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Average Latency</span>
            <Gauge size={18} color="var(--accent-purple)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-purple)' }}>{summary.avg_latency_ms} ms</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Active Edge Nodes</span>
            <Server size={18} color="var(--primary)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{edges.filter(e => e.status === 'online').length} / {edges.length}</div>
        </div>
      </div>

      {/* Edge Server Status Cards */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={18} color="var(--primary)" /> Network Edge Server Status
          </h3>

          {user && user.role === 'admin' && (
            <button onClick={() => handlePurgeEdge('')} className="btn btn-outline-danger" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
              <Trash2 size={14} /> Purge All Edge Caches
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {edges.map(edge => (
            <div key={edge.id} style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--primary)' }}>{edge.name}</span>
                <span className={`badge ${edge.status === 'online' ? 'badge-hit' : 'badge-miss'}`}>
                  {edge.status.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Port: {edge.base_url.split(':').pop()} • Lat: {edge.latitude}, Lng: {edge.longitude}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem' }}>Cached Files: <strong>{edge.cache_count || 0}</strong></span>
                {user && user.role === 'admin' && (
                  <button onClick={() => handlePurgeEdge(edge.name)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}>
                    Purge
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Request Logs Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} color="var(--primary)" /> Real-Time Request Stream Log
          </h3>
          <button onClick={fetchAnalytics} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Logs
          </button>
        </div>

        {logs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', padding: '16px 0' }}>No CDN requests logged yet. Use the simulator to send file requests.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 12px' }}>Time</th>
                  <th style={{ padding: '10px 12px' }}>User</th>
                  <th style={{ padding: '10px 12px' }}>File</th>
                  <th style={{ padding: '10px 12px' }}>Edge Served</th>
                  <th style={{ padding: '10px 12px' }}>Cache Status</th>
                  <th style={{ padding: '10px 12px' }}>Latency</th>
                  <th style={{ padding: '10px 12px' }}>Strategy</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                      {log.user_name || 'Anonymous User'}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>
                      {log.filename}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--accent-purple)' }}>
                      {log.edge_server_used}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className={`badge ${log.cache_hit === 1 ? 'badge-hit' : 'badge-miss'}`}>
                        {log.cache_hit === 1 ? 'HIT' : 'MISS'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {log.response_time_ms} ms
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                      {log.routing_mode}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
