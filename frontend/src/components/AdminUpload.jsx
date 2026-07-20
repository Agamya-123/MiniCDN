import React, { useState, useEffect } from 'react';
import { UploadCloud, Trash2, FileText, CheckCircle2, ShieldAlert, RefreshCw } from 'lucide-react';
import axios from 'axios';

export default function AdminUpload({ token, onUploadSuccess }) {
  const [file, setFile] = useState(null);
  const [pushSync, setPushSync] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [files, setFiles] = useState([]);

  const fetchFiles = async () => {
    try {
      const res = await axios.get('/api/files');
      setFiles(res.data.files || []);
    } catch (err) {
      console.error('Failed to fetch files:', err);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setMessage('');
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post(`/api/origin/upload?pushSync=${pushSync}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        }
      });

      setMessage('File uploaded successfully to Origin Server!');
      setFile(null);
      fetchFiles();
      if (onUploadSuccess) onUploadSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload file');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Delete ${filename} from Origin Server?`)) return;

    try {
      await axios.delete(`/api/files/${filename}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchFiles();
      if (onUploadSuccess) onUploadSuccess();
    } catch (err) {
      alert('Failed to delete file');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '24px' }}>
      
      {/* Upload Box (5 cols) */}
      <div className="glass-panel" style={{ gridColumn: 'span 5', padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <ShieldAlert size={22} color="var(--accent-purple)" />
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Admin File Upload</h2>
        </div>

        {message && (
          <div style={{ background: 'rgba(52, 211, 153, 0.15)', border: '1px solid rgba(52, 211, 153, 0.3)', color: '#34d399', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} /> {message}
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#f43f5e', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleUpload}>
          <div className="form-group">
            <label className="form-label">Select File to Store on Origin (Port 4001)</label>
            <input
              type="file"
              className="form-input"
              style={{ cursor: 'pointer', padding: '12px' }}
              onChange={(e) => setFile(e.target.files[0])}
              required
            />
          </div>

          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', margin: '16px 0' }}>
            <input
              type="checkbox"
              id="pushSync"
              checked={pushSync}
              onChange={(e) => setPushSync(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="pushSync" style={{ fontSize: '0.85rem', color: 'var(--text-main)', cursor: 'pointer' }}>
              Enable Proactive Push-Sync (Notify edges to invalidate cache)
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '8px' }}
            disabled={loading || !file}
          >
            {loading ? <RefreshCw size={18} className="animate-spin" /> : <UploadCloud size={18} />}
            {loading ? 'Uploading to Origin...' : 'Upload to Origin Server'}
          </button>
        </form>
      </div>

      {/* Origin Files Catalog (7 cols) */}
      <div className="glass-panel" style={{ gridColumn: 'span 7', padding: '28px' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '20px' }}>Origin Server Master Catalog</h2>

        {files.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No files currently uploaded to Origin Server.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {files.map((f) => (
              <div key={f.id} style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <FileText size={24} color="var(--primary)" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{f.original_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      ID: {f.filename} • {(f.size / 1024).toFixed(1)} KB • {new Date(f.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(f.filename)}
                  className="btn btn-outline-danger"
                  style={{ padding: '8px 12px' }}
                  title="Delete file"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
