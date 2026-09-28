import { useState, useEffect } from 'react';
import './index.css';
import {
  Bluetooth, MapPin, Activity, Music, Settings, LayoutDashboard,
  Battery, Thermometer, Navigation2, Map as MapIcon, Route, Zap, Home, Settings2, Play, SkipBack, SkipForward,
  Lightbulb, AlertCircle, Droplets, Gauge, ArrowLeft, ArrowRight, ArrowUpRight
} from 'lucide-react';

function App() {
  const [speed, setSpeed] = useState(0);
  const [rpm, setRpm] = useState(0);
  const [gear, setGear] = useState(0);
  const [engineTemp, setEngineTemp] = useState(0);
  const [battery, setBattery] = useState(0);
  const [fuel, setFuel] = useState(100);
  const [throttle, setThrottle] = useState(0);
  const [leanAngle, setLeanAngle] = useState(0);
  const [btStatus, setBtStatus] = useState("Disconnected");
  const [time, setTime] = useState(new Date());

  const [tripDistance, setTripDistance] = useState(0);
  const [topSpeed, setTopSpeed] = useState(0);
  const [rideTime, setRideTime] = useState(0);
  const [engineLoad, setEngineLoad] = useState(0);
  const [avgSpeed, setAvgSpeed] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [secretKey] = useState("AA017F0035303030303030303030303030303030303030303030613934356632643733623234666463613934656338373333376332363564620005E6");

  const addLog = (msg: string) => {
    setLogs(prev => {
        const newLogs = [...prev, msg];
        if (newLogs.length > 50) newLogs.shift();
        return newLogs;
    });
  };

  const formatRideTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const connectBluetooth = async () => {
    try {
      setBtStatus("Connecting BT...");
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb']
      });
      
      const server = await device.gatt?.connect();
      if (!server) throw new Error("No GATT server");
      
      const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
      
      if (secretKey) {
         addLog("[AUTH] Sending secret key...");
         const hexArray = secretKey.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [];
         await characteristic.writeValue(new Uint8Array(hexArray));
         addLog("[AUTH] Key sent successfully.");
      }

      await characteristic.startNotifications();
      
      setBtStatus("Connected BT");
      
      characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value;
        const bytes = new Uint8Array(value.buffer);
        
        const hexStr = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
        addLog(`[BT-UART] ` + hexStr);

        if (bytes.length >= 20 && bytes[0] === 0x6b && bytes[1] === 0x05) {
          const currentSpeed = bytes[16]; 
          const currentTemp = bytes[9];   
          const rpmMsb = bytes[5];
          const rpmLsb = bytes[6];
          const currentRpm = ((rpmMsb << 8) | rpmLsb) * 5; 
          
          const currentBattery = (bytes[27] / 10) + 1.2;
          const currentThrottle = Math.min(100, Math.round((bytes[21] / 191) * 100));
          const currentLean = bytes[34] ? bytes[34] - 128 : 0;
          
          let currentGear = 1;
          if (currentSpeed === 0) currentGear = 0;
          else {
             const ratio = currentSpeed / currentRpm;
             if (ratio > 0.02) currentGear = 6;
             else if (ratio > 0.015) currentGear = 5;
             else if (ratio > 0.011) currentGear = 4;
             else if (ratio > 0.008) currentGear = 3;
             else if (ratio > 0.005) currentGear = 2;
             else currentGear = 1;
          }
          
          setSpeed(currentSpeed);
          setEngineTemp(currentTemp);
          setRpm(currentRpm);
          setBattery(currentBattery);
          setThrottle(currentThrottle);
          setLeanAngle(currentLean);
          setGear(currentGear);
          setFuel(Math.max(0, 100 - (currentSpeed * 0.1)));
          
          setTopSpeed(prev => Math.max(prev, currentSpeed));
          setEngineLoad(Math.round(currentThrottle * 0.8 + (currentRpm/14000) * 20));
          setTripDistance(prev => prev + (currentSpeed * (0.05 / 3600)));
          setRideTime(prev => {
             const newTime = prev + 0.05;
             if (newTime > 0) {
                 setAvgSpeed(speedState => speedState === 0 ? currentSpeed : (speedState * 0.95 + currentSpeed * 0.05));
             }
             return newTime;
          });
        }
      });
      
    } catch (err) {
      console.error(err);
      setBtStatus("BT Error");
    }
  };

  const replayLog = async () => {
    try {
      setBtStatus("Fetching Replay...");
      const res = await fetch('http://127.0.0.1:8000/replay_log');
      const text = await res.text();
      const lines = text.split('\n').filter(l => l.includes('] 6b 05 '));

      setBtStatus(`Replaying ${lines.length} pkts`);

      let i = 0;
      const interval = setInterval(() => {
        if (i >= lines.length) {
          clearInterval(interval);
          setBtStatus("Replay Finished");
          return;
        }

        const line = lines[i];
        const hexStr = line.split(']')[1].trim();
        addLog(`[REPLAY] ` + hexStr);
        const hexParts = hexStr.split(' ');

        const bytes = new Uint8Array(hexParts.map(h => parseInt(h, 16)));

        if (bytes.length >= 20 && bytes[0] === 0x6b && bytes[1] === 0x05) {
          const currentSpeed = bytes[16];
          const currentTemp = bytes[9];
          const rpmMsb = bytes[5];
          const rpmLsb = bytes[6];
          const currentRpm = ((rpmMsb << 8) | rpmLsb) * 5;

          const currentBattery = (bytes[27] / 10) + 1.2;
          const currentThrottle = Math.min(100, Math.round((bytes[21] / 191) * 100));
          const currentLean = bytes[34] ? bytes[34] - 128 : 0;

          let currentGear = 1;
          if (currentSpeed === 0) currentGear = 0;
          else {
            const ratio = currentSpeed / currentRpm;
            if (ratio > 0.02) currentGear = 6;
            else if (ratio > 0.015) currentGear = 5;
            else if (ratio > 0.011) currentGear = 4;
            else if (ratio > 0.008) currentGear = 3;
            else if (ratio > 0.005) currentGear = 2;
            else currentGear = 1;
          }

          setSpeed(currentSpeed);
          setEngineTemp(currentTemp);
          setRpm(currentRpm);
          setBattery(currentBattery);
          setThrottle(currentThrottle);
          setLeanAngle(currentLean);
          setGear(currentGear);
          setFuel(Math.max(0, 100 - (currentSpeed * 0.1)));

          setTopSpeed(prev => Math.max(prev, currentSpeed));
          setEngineLoad(Math.round(currentThrottle * 0.8 + (currentRpm / 14000) * 20));
          setTripDistance(prev => prev + (currentSpeed * (0.05 / 3600)));
          setRideTime(prev => {
            const newTime = prev + 0.05;
            if (newTime > 0) {
              setAvgSpeed(speedState => speedState === 0 ? currentSpeed : (speedState * 0.95 + currentSpeed * 0.05));
            }
            return newTime;
          });
        }

        i++;
      }, 50);

    } catch (err) {
      console.error(err);
      alert("Failed to replay log");
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="app-container">

      {/* HEADER */}
      <header className="header">
        <div className="header-logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 22H22L12 2Z" stroke="var(--cyan-primary)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M12 8L6 20H18L12 8Z" fill="var(--cyan-primary)" opacity="0.3" />
          </svg>
          <h1>BIKE CONNECT <span>MT-15</span></h1>
        </div>

        <nav className="header-nav">
          <div className="nav-item active"><LayoutDashboard size={20} /> Dashboard</div>
          <div className="nav-item"><MapIcon size={20} /> Live Map</div>
          <div className="nav-item"><Activity size={20} /> Ride Analytics</div>
          <div className="nav-item"><Route size={20} /> Trips</div>
          <div className="nav-item"><Music size={20} /> Music</div>
          <div className="nav-item"><Settings size={20} /> Settings</div>
        </nav>

        <div className="header-status">
          <div className="bt-status" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bluetooth className="bt-icon" size={20} />
              <div className="bt-info">
                <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
                  <button className="action-btn connect-btn" onClick={connectBluetooth}>CONNECT BT</button>
                  <button className="action-btn play-btn" onClick={replayLog}>{btStatus === "Disconnected" ? "PLAY LOG" : btStatus}</button>
                </div>
                <span className="bt-id">YCCU_00080400007795</span>
              </div>
            </div>
            <div className="secret-key-box" style={{ fontSize: '0.7rem', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--glass-border)' }}>
              KEY: {secretKey.substring(0, 16)}...
            </div>
          </div>
          <div className="time-display">
            <span className="time">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="date">{time.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="main-content">

        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="nav-item active"><LayoutDashboard size={20} /> Dashboard</div>
          <div className="nav-item"><MapPin size={20} /> Live Map</div>
          <div className="nav-item"><Activity size={20} /> Ride Analytics</div>
          <div className="nav-item"><Route size={20} /> Trips & History</div>
          <div className="nav-item"><Music size={20} /> Music Control</div>
          <div className="nav-item"><Settings2 size={20} /> Bike Status</div>
          <div className="nav-item" style={{ marginTop: 'auto' }}><Settings size={20} /> Settings</div>
        </aside>

        {/* DASHBOARD GRID */}
        <div className="dashboard-grid">

          {/* HERO COCKPIT */}
          <div className="panel hero-cockpit">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="hero-video-bg"
              src="/gemini_generated_video_4a1c27eb.mp4"
            />

            <div className="bike-model-container">
              <img src="/mt15.png" alt="Yamaha MT-15" />
            </div>

            <div className="speedometer-container">
              <div className="speed-ring"></div>
              <div className="speed-ring-active"></div>
              <div className="speed-value-wrapper">
                <div className="speed-value">{speed}</div>
                <div className="speed-unit">KM/H</div>
                <div className="rpm-display">RPM {rpm.toLocaleString()}</div>
              </div>
              <div className="gear-display">
                <span className="gear-val">{gear}</span>
                <span className="gear-label">GEAR</span>
              </div>
              <div style={{ position: 'absolute', bottom: '40px', left: '-20px', color: 'rgba(255,255,255,0.4)', fontWeight: 'bold' }}>TCS</div>
              <div style={{ position: 'absolute', bottom: '40px', right: '-20px', color: 'var(--cyan-primary)', fontWeight: 'bold', textShadow: '0 0 10px var(--cyan-primary)' }}>VVA</div>
            </div>
          </div>

          {/* TELEMETRY SIDEBAR */}
          <div className="telemetry-sidebar">
            <div className="telemetry-grid">
              <div className="telemetry-card">
                <div className="t-card-header"><Battery className="t-card-icon" /> <span className="t-card-label">Battery Voltage</span></div>
                <div className="t-card-value">{battery.toFixed(1)} <span className="t-card-unit">v</span></div>
              </div>
              <div className="telemetry-card">
                <div className="t-card-header"><Thermometer className="t-card-icon" color="var(--red-warning)" /> <span className="t-card-label">Engine Temp</span></div>
                <div className="t-card-value">{engineTemp} <span className="t-card-unit">°C</span></div>
              </div>
              <div className="telemetry-card">
                <div className="t-card-header"><Droplets className="t-card-icon" color="var(--blue-primary)" /> <span className="t-card-label">Fuel Level</span></div>
                <div className="t-card-value">{fuel} <span className="t-card-unit">%</span></div>
              </div>
              <div className="telemetry-card">
                <div className="t-card-header"><Gauge className="t-card-icon" color="var(--green-accent)" /> <span className="t-card-label">Throttle Pos</span></div>
                <div className="t-card-value">{throttle} <span className="t-card-unit">%</span></div>
              </div>
              <div className="telemetry-card">
                <div className="t-card-header"><Route className="t-card-icon" /> <span className="t-card-label">Trip Distance</span></div>
                <div className="t-card-value">{tripDistance.toFixed(1)} <span className="t-card-unit">km</span></div>
              </div>
              <div className="telemetry-card">
                <div className="t-card-header"><Activity className="t-card-icon" /> <span className="t-card-label">Avg. Speed</span></div>
                <div className="t-card-value">{Math.round(avgSpeed)} <span className="t-card-unit">km/h</span></div>
              </div>
            </div>

            <div className="indicators-panel">
              <div className="indicator active green"><ArrowLeft size={20} /></div>
              <div className="indicator active green"><ArrowRight size={20} /></div>
              <div className="indicator active blue"><Lightbulb size={20} /></div>
              <div className="indicator active yellow" style={{ fontWeight: 'bold', fontSize: '0.7rem' }}>ABS</div>
              <div className="indicator"><AlertCircle size={20} /></div>
              <div className="indicator"><Thermometer size={20} /></div>
            </div>
          </div>

          {/* BOTTOM ROW: GPS & METRICS */}
          <div className="bottom-row">
            <div className="panel gps-panel">
              <div className="gps-header">
                <span className="panel-title">Live GPS Tracking</span>
                <span className="live-badge"><div className="live-dot"></div> LIVE</span>
              </div>
              <div className="map-bg"></div>
              <div className="map-overlay">
                <div className="nav-instruction">
                  <div className="nav-icon"><ArrowUpRight size={24} /></div>
                  <div className="nav-text">
                    <div className="dist">-- km</div>
                    <div className="street">Waiting for GPS...</div>
                  </div>
                </div>
                <div className="map-stats">
                  <div className="m-stat"><span className="m-val">-- km</span><span className="m-lbl">Distance</span></div>
                  <div className="m-stat"><span className="m-val">-- min</span><span className="m-lbl">ETA</span></div>
                  <div className="m-stat"><span className="m-val">--:--</span><span className="m-lbl">Arrival</span></div>
                </div>
              </div>
            </div>

            <div className="panel metrics-panel">
              <div className="m-header-row">
                <span className="panel-title">Ride Metrics</span>
                <div className="filters">
                  <button className="filter-btn active">Today</button>
                  <button className="filter-btn">This Week</button>
                  <button className="filter-btn">This Month</button>
                </div>
              </div>
              <div className="metrics-grid">
                <div className="metric-item">
                  <span className="mi-val">{tripDistance.toFixed(1)}<span className="mi-unit">km</span></span>
                  <span className="mi-lbl">Distance</span>
                </div>
                <div className="metric-item">
                  <span className="mi-val">{Math.round(avgSpeed)}<span className="mi-unit">km/h</span></span>
                  <span className="mi-lbl">Avg. Speed</span>
                </div>
                <div className="metric-item">
                  <span className="mi-val">{formatRideTime(rideTime)}</span>
                  <span className="mi-lbl">Ride Time</span>
                </div>
                <div className="metric-item">
                  <span className="mi-val">{topSpeed}<span className="mi-unit">km/h</span></span>
                  <span className="mi-lbl">Top Speed</span>
                </div>
                <div className="metric-item" style={{ gridColumn: '1 / -1' }}>
                  <span className="mi-val">{fuel > 0 ? ((tripDistance / (100 - fuel)) * 10).toFixed(1) : '0.0'}<span className="mi-unit">km/L</span></span>
                  <span className="mi-lbl">Fuel Efficiency</span>
                </div>
              </div>
            </div>

            <div className="panel lean-compass">
              <div className="lean-panel">
                <span className="panel-title" style={{ alignSelf: 'flex-start' }}>Lean Angle</span>
                <div className="gauge-circle">
                  <span className="gauge-val">{Math.abs(leanAngle)}°</span>
                  <span className="gauge-lbl">{leanAngle > 0 ? 'Right' : leanAngle < 0 ? 'Left' : 'Center'}</span>
                </div>
              </div>
              <div style={{ height: '1px', background: 'var(--glass-border)', width: '80%', alignSelf: 'center' }}></div>
              <div className="compass-panel">
                <span className="panel-title" style={{ alignSelf: 'flex-start' }}>Direction</span>
                <div className="gauge-circle" style={{ borderColor: 'var(--red-accent)' }}>
                  <Navigation2 size={24} color="var(--red-accent)" style={{ transform: 'rotate(-40deg)' }} />
                  <span className="gauge-val" style={{ fontSize: '1.2rem', marginTop: '4px' }}>320°</span>
                  <span className="gauge-lbl">NW</span>
                </div>
              </div>
            </div>
          </div>

          {/* GRAPHS & FOOTER */}
          <div className="graphs-row">
            <div className="panel graph-panel">
              <div className="g-header">
                <span className="panel-title">Throttle Input</span>
                <span className="g-val">{throttle}%</span>
              </div>
              <svg className="graph-svg" viewBox="0 0 100 30" preserveAspectRatio="none">
                <path d="M0,25 Q10,25 20,20 T40,25 T60,15 T80,20 T100,5" />
              </svg>
            </div>

            <div className="panel graph-panel">
              <div className="g-header">
                <span className="panel-title" style={{ color: 'var(--red-accent)' }}>RPM Graph</span>
                <span className="g-val">{rpm.toLocaleString()}</span>
              </div>
              <svg className="graph-svg" viewBox="0 0 100 30" preserveAspectRatio="none">
                <path d="M0,25 Q10,20 20,15 T40,10 T60,15 T80,5 T100,2" />
              </svg>
            </div>

            <div className="panel graph-panel">
              <div className="g-header">
                <span className="panel-title" style={{ color: 'var(--blue-primary)' }}>Engine Load</span>
                <span className="g-val">{engineLoad}%</span>
              </div>
              <svg className="graph-svg" viewBox="0 0 100 30" preserveAspectRatio="none">
                <path d="M0,30 Q10,25 20,15 T40,10 T60,20 T80,15 T100,5" />
              </svg>
            </div>

            <div className="panel music-player">
              <img src="https://i.scdn.co/image/ab67616d0000b273570776bf0ed2195f269a9b6c" alt="Album Art" className="album-art" />
              <div className="track-info">
                <span className="t-title">Naa Ready</span>
                <span className="t-artist">Anirudh Ravichander</span>
              </div>
              <div className="music-controls">
                <SkipBack className="m-btn" size={20} />
                <Play className="m-btn" size={24} fill="currentColor" />
                <SkipForward className="m-btn" size={20} />
              </div>
            </div>
          </div>

          {/* TERMINAL ROW */}
          <div className="panel terminal-panel" style={{ gridColumn: '1 / -1', height: '150px', background: 'rgba(5, 10, 20, 0.9)', overflowY: 'auto', padding: '10px', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--cyan-primary)' }}>
            <div style={{ color: '#aaa', marginBottom: '5px' }}>// SYSTEM TELEMETRY LOGS</div>
            {logs.map((l, idx) => (
              <div key={idx}>{l}</div>
            ))}
          </div>

        </div>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <div className="mobile-bottom-nav">
        <div className="m-nav-item active"><Home size={24} /> Home</div>
        <div className="m-nav-item"><MapIcon size={24} /> Map</div>
        <div className="m-nav-item"><Zap size={24} /> Bike</div>
        <div className="m-nav-item"><Settings size={24} /> More</div>
      </div>
    </div>
  );
}

export default App;
