import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Download, RefreshCw, Zap, MapPin, Gauge, ShieldCheck, FileText, CheckCircle2, AlertCircle, Sliders, Radio } from 'lucide-react';
import axios from 'axios';

// Custom Leaflet Icons using SVGs
const createCustomIcon = (color, label) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="${color}" stroke="#0b0f19" stroke-width="1.5">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      <circle cx="12" cy="9" r="2.5" fill="#0b0f19"/>
    </svg>`;
  return L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="display:flex; flex-direction:column; align-items:center;">
            ${svg}
            <span style="background:#0f172a; color:#fff; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; border:1px solid rgba(255,255,255,0.2); white-space:nowrap;">${label}</span>
          </div>`,
    iconSize: [36, 48],
    iconAnchor: [18, 40]
  });
};

const userIcon = createCustomIcon('#38bdf8', 'Client User');
const edgeIcon = createCustomIcon('#c084fc', 'Edge Server');

function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

const PRESET_LOCATIONS = [
  { name: 'Delhi (North)', lat: 28.6139, lng: 77.2090 },
  { name: 'Mumbai (West)', lat: 19.0760, lng: 72.8777 },
  { name: 'Bangalore (South)', lat: 12.9716, lng: 77.5946 },
  { name: 'Lucknow (North-Central)', lat: 26.8467, lng: 80.9462 },
  { name: 'Kolkata (East)', lat: 22.5726, lng: 88.3639 },
  { name: 'Chennai (South-East)', lat: 13.0827, lng: 80.2707 },
  { name: 'Hyderabad (South-Central)', lat: 17.3850, lng: 78.4867 }
];

export default function MapSimulator() {
  const [selectedPreset, setSelectedPreset] = useState(PRESET_LOCATIONS[0]);
  const [clientPos, setClientPos] = useState({ lat: PRESET_LOCATIONS[0].lat, lng: PRESET_LOCATIONS[0].lng });
  const [edges, setEdges] = useState([]);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [forceEdge, setForceEdge] = useState('');
  const [routingMode, setRoutingMode] = useState('geo');

  // Image Optimization Controls
  const [imgWidth, setImgWidth] = useState('');
  const [imgFormat, setImgFormat] = useState('');

  const [loading, setLoading] = useState(false);
  const [rateLimitError, setRateLimitError] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [activeConnectionLine, setActiveConnectionLine] = useState(null);
  const [sseConnected, setSseConnected] = useState(false);

  // Fetch Edges & Files catalog
  const fetchData = async () => {
    try {
      const [edgesRes, filesRes] = await Promise.all([
        axios.get('/api/edges'),
        axios.get('/api/files')
      ]);
      setEdges(edgesRes.data.edges || []);
      const fileList = filesRes.data.files || [];
      setFiles(fileList);
      if (fileList.length > 0 && !selectedFile) {
        setSelectedFile(fileList[0].filename);
      }
    } catch (err) {
      console.error('Failed to load edge topology or file list:', err);
    }
  };

  useEffect(() => {
    fetchData();

    // Connect to Server-Sent Events stream for real-time updates
    const eventSource = new EventSource('/api/stream');

    eventSource.onopen = () => {
      setSseConnected(true);
    };

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'REQUEST_LOGGED' || data.type === 'CACHE_PURGED' || data.type === 'FILE_UPLOADED') {
          fetchData();
        }
      } catch (err) {}
    };

    eventSource.onerror = () => {
      setSseConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handlePresetChange = (presetName) => {
    const found = PRESET_LOCATIONS.find(p => p.name === presetName);
    if (found) {
      setSelectedPreset(found);
      setClientPos({ lat: found.lat, lng: found.lng });
    }
  };

  const handleRequestFile = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setRateLimitError('');
    setLastResult(null);
    setActiveConnectionLine(null);

    const startTime = Date.now();
    try {
      const params = new URLSearchParams({
        lat: clientPos.lat,
        lng: clientPos.lng,
        mode: routingMode
      });
      if (forceEdge) params.append('forceEdge', forceEdge);
      if (imgWidth) params.append('width', imgWidth);
      if (imgFormat) params.append('format', imgFormat);

      const res = await axios.get(`/api/file/${selectedFile}?${params.toString()}`, {
        responseType: 'blob'
      });

      const clientLatency = Date.now() - startTime;
      const headers = res.headers;
      
      const edgeName = headers['x-cdn-edge-server'] || 'Unknown Edge';
      const cacheStatus = headers['x-cdn-cache-status'] || 'UNKNOWN';
      const serverLatency = headers['x-cdn-response-time-ms'] || clientLatency;
      const distanceKm = headers['x-cdn-edge-distance-km'] || '?';
      const modeUsed = headers['x-cdn-routing-mode'] || routingMode;
      const processedOnTheFly = headers['x-cdn-processed-on-the-fly'] === 'true';
      const lruEvictedFile = headers['x-cdn-lru-evicted'] || null;

      // Find matching edge server position for map arc
      const matchedEdge = edges.find(e => e.name.toLowerCase() === edgeName.toLowerCase() || edgeName.includes(e.name));
      if (matchedEdge) {
        setActiveConnectionLine([
          [clientPos.lat, clientPos.lng],
          [matchedEdge.latitude, matchedEdge.longitude]
        ]);
      }

      // Create preview object URL
      const blob = res.data;
      const objectUrl = URL.createObjectURL(blob);
      const isImage = blob.type.startsWith('image/');

      setLastResult({
        edgeName,
        cacheStatus,
        serverLatency,
        clientLatency,
        distanceKm,
        modeUsed,
        processedOnTheFly,
        lruEvictedFile,
        objectUrl,
        isImage,
        sizeBytes: blob.size,
        filename: selectedFile
      });

      fetchData();

    } catch (err) {
      if (err.response && err.response.status === 429) {
        setRateLimitError('WAF Protection Activated: Rate limit exceeded (Max 30 req/min)');
      } else {
        alert('Failed to request file via CDN. Ensure origin & edge servers are online.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
      
      {/* Control Panel (Left column) */}
      <div className="glass-panel" style={{ flex: '1 1 340px', padding: '24px', minWidth: '300px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={20} color="var(--primary)" /> CDN Simulator Controls
          </h2>
          <span className={`badge ${sseConnected ? 'badge-hit' : 'badge-miss'}`} title="Real-Time Server-Sent Events Stream">
            <Radio size={12} className={sseConnected ? 'animate-pulse' : ''} /> {sseConnected ? 'SSE REALTIME' : 'POLLING'}
          </span>
        </div>

        {rateLimitError && (
          <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#f43f5e', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} /> {rateLimitError}
          </div>
        )}

        {/* File Selection */}
        <div className="form-group">
          <label className="form-label">Select File to Request</label>
          <select className="form-select" value={selectedFile} onChange={(e) => setSelectedFile(e.target.value)}>
            {files.length === 0 && <option value="">No files uploaded yet</option>}
            {files.map(f => (
              <option key={f.filename} value={f.filename}>
                {f.original_name} ({(f.size / 1024).toFixed(1)} KB)
              </option>
            ))}
          </select>
        </div>

        {/* Dynamic Image Optimization Options */}
        <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <Sliders size={14} /> Edge Image Processing (Sharp)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
              <label className="form-label">Resize Width</label>
              <select className="form-select" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={imgWidth} onChange={(e) => setImgWidth(e.target.value)}>
                <option value="">Original</option>
                <option value="200">200 px</option>
                <option value="400">400 px</option>
                <option value="800">800 px</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
              <label className="form-label">Target Format</label>
              <select className="form-select" style={{ padding: '6px 10px', fontSize: '0.85rem' }} value={imgFormat} onChange={(e) => setImgFormat(e.target.value)}>
                <option value="">Original</option>
                <option value="webp">WebP (Compressed)</option>
                <option value="jpg">JPEG</option>
                <option value="png">PNG</option>
              </select>
            </div>
          </div>
        </div>

        {/* Client Geolocation Preset */}
        <div className="form-group">
          <label className="form-label">Simulated Client Location</label>
          <select className="form-select" value={selectedPreset.name} onChange={(e) => handlePresetChange(e.target.value)}>
            {PRESET_LOCATIONS.map(loc => (
              <option key={loc.name} value={loc.name}>{loc.name}</option>
            ))}
          </select>
        </div>

        {/* Lat / Lng Fine Tuning */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
            <label className="form-label">Client Lat</label>
            <input
              type="number"
              step="0.0001"
              className="form-input"
              value={clientPos.lat}
              onChange={(e) => setClientPos({ ...clientPos, lat: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
            <label className="form-label">Client Lng</label>
            <input
              type="number"
              step="0.0001"
              className="form-input"
              value={clientPos.lng}
              onChange={(e) => setClientPos({ ...clientPos, lng: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>

        {/* Routing Mode */}
        <div className="form-group">
          <label className="form-label">Routing Algorithm Strategy</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setRoutingMode('geo')}
              className={`btn ${routingMode === 'geo' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, padding: '8px', fontSize: '0.8rem', justifyContent: 'center' }}
            >
              Haversine Geo
            </button>
            <button
              onClick={() => setRoutingMode('latency')}
              className={`btn ${routingMode === 'latency' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, padding: '8px', fontSize: '0.8rem', justifyContent: 'center' }}
            >
              Ping Latency
            </button>
          </div>
        </div>

        {/* Force Edge Override */}
        <div className="form-group">
          <label className="form-label">Force Edge Override (Manual Test)</label>
          <select className="form-select" value={forceEdge} onChange={(e) => setForceEdge(e.target.value)}>
            <option value="">Auto (Nearest / Fastest Edge)</option>
            {edges.map(e => (
              <option key={e.id} value={e.name.toLowerCase()}>Force {e.name} (Port {e.base_url.split(':').pop()})</option>
            ))}
          </select>
        </div>

        {/* Execute Request Button */}
        <button
          onClick={handleRequestFile}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '14px', marginTop: '12px', fontSize: '1rem' }}
          disabled={loading || !selectedFile}
        >
          {loading ? <RefreshCw size={18} className="animate-spin" /> : <Download size={18} />}
          {loading ? 'Routing Request...' : 'Fetch File via CDN'}
        </button>
      </div>

      {/* Map & Results (Right column) */}
      <div style={{ flex: '1 1 600px', display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
        
        {/* Leaflet Map Card */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={18} color="var(--primary)" /> Interactive Edge Server Map
            </h3>
            <span className="badge badge-info">
              {edges.filter(e => e.status === 'online').length} Edges Online
            </span>
          </div>

          <MapContainer center={[21.0000, 78.0000]} zoom={4.5} scrollWheelZoom={false}>
            <RecenterMap center={[clientPos.lat, clientPos.lng]} />
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {/* Client Position Marker */}
            <Marker position={[clientPos.lat, clientPos.lng]} icon={userIcon}>
              <Popup>
                <strong>Client User</strong><br />
                Lat: {clientPos.lat}, Lng: {clientPos.lng}
              </Popup>
            </Marker>

            {/* Edge Servers Markers */}
            {edges.map((edge) => (
              <Marker key={edge.id} position={[edge.latitude, edge.longitude]} icon={edgeIcon}>
                <Popup>
                  <strong>Edge Server: {edge.name}</strong><br />
                  Port: {edge.base_url.split(':').pop()}<br />
                  Cache Usage: {edge.cache_count || 0} / {edge.max_capacity || 5} files<br />
                  TTL Expiry: {edge.ttl_minutes || 10} mins<br />
                  Status: <span style={{ color: edge.status === 'online' ? '#34d399' : '#f43f5e' }}>{edge.status}</span>
                </Popup>
              </Marker>
            ))}

            {/* Active Request Connection Line */}
            {activeConnectionLine && (
              <Polyline
                positions={activeConnectionLine}
                pathOptions={{ color: '#38bdf8', weight: 4, opacity: 0.8, dashArray: '8, 8' }}
              />
            )}
          </MapContainer>
        </div>

        {/* Request Result Metrics Panel */}
        {lastResult && (
          <div className="glass-panel" style={{ padding: '24px', borderColor: lastResult.cacheStatus === 'HIT' ? 'rgba(52, 211, 153, 0.4)' : 'rgba(251, 191, 36, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Request Execution Summary</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{lastResult.filename}</p>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {lastResult.processedOnTheFly && (
                  <span className="badge badge-purple" style={{ fontSize: '0.9rem', padding: '6px 14px' }}>
                    <Sliders size={16} /> SHARP TRANSFORMED
                  </span>
                )}
                <span className={`badge ${lastResult.cacheStatus === 'HIT' ? 'badge-hit' : 'badge-miss'}`} style={{ fontSize: '0.9rem', padding: '6px 14px' }}>
                  {lastResult.cacheStatus === 'HIT' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  CACHE {lastResult.cacheStatus}
                </span>
                <span className="badge badge-purple" style={{ fontSize: '0.9rem', padding: '6px 14px' }}>
                  <Gauge size={16} /> {lastResult.clientLatency} ms
                </span>
              </div>
            </div>

            {lastResult.lruEvictedFile && (
              <div style={{ background: 'rgba(251, 191, 36, 0.15)', border: '1px solid rgba(251, 191, 36, 0.3)', color: '#fbbf24', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '16px' }}>
                <strong>⚠️ LRU Cache Eviction:</strong> Storage full at {lastResult.edgeName}. Automatically evicted least recently used file: <code>{lastResult.lruEvictedFile}</code>
              </div>
            )}

            {/* Metric Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Served By Edge</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>{lastResult.edgeName}</div>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Geo Distance</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-purple)' }}>{lastResult.distanceKm} km</div>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Processing Time</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>{lastResult.serverLatency} ms</div>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Strategy Used</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f3f4f6' }}>{lastResult.modeUsed.toUpperCase()}</div>
              </div>
            </div>

            {/* File Content Preview */}
            <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>File Payload Preview</div>
              {lastResult.isImage ? (
                <img src={lastResult.objectUrl} alt="Payload preview" style={{ maxHeight: '200px', borderRadius: '8px', objectFit: 'contain' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <FileText size={32} color="var(--primary)" />
                  <div>
                    <div style={{ fontWeight: 600 }}>{lastResult.filename}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Size: {(lastResult.sizeBytes / 1024).toFixed(1)} KB</div>
                  </div>
                  <a href={lastResult.objectUrl} download={lastResult.filename} className="btn btn-secondary" style={{ marginLeft: 'auto' }}>
                    <Download size={14} /> Save File
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
