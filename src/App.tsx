import { useState, useEffect, useRef } from 'react';
import './index.css';
import {
  Bluetooth, MapPin, Activity, Settings, LayoutDashboard,
  Battery, Thermometer, Navigation2, Map as MapIcon, Route, Zap, Home, Settings2,
  Lightbulb, AlertCircle, Droplets, Gauge, ArrowLeft, ArrowRight, ArrowUpRight, Terminal, Search, Sun, Moon, Menu, X
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function LocationMarker({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pos) {
      map.setView(pos, 16);
    }
  }, [pos, map]);
  return pos ? (
    <Marker position={pos}>
      <Popup>You are here!</Popup>
    </Marker>
  ) : null;
}

function RouteFitter({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points && points.length > 0) {
      map.fitBounds(points, { padding: [50, 50] });
    }
  }, [points, map]);
  return null;
}

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
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [time, setTime] = useState(new Date());
  const [showLogs, setShowLogs] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Live GPS Tracking
  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => console.error("GPS Error:", error),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // Global Theme State
  const [appTheme, setAppTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appTheme);
  }, [appTheme]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPaired, setIsPaired] = useState<boolean>(() => localStorage.getItem('isPaired') === 'true');
  const [tripHistory, setTripHistory] = useState<any[]>([]);
  const [astraMsg, setAstraMsg] = useState("");
  const [astraStatus, setAstraStatus] = useState("ASTRA AI");

  // Auto-trigger ASTRA: track last condition so we only speak on CHANGE
  const lastAstraCondition = useRef<string>("");
  const astraCooldown = useRef<boolean>(false);
  const astraAutoEnabled = useRef<boolean>(true);

  // Routing State
  const [searchQuery, setSearchQuery] = useState("");
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);
  const [alternativeRoutes, setAlternativeRoutes] = useState<[number, number][][]>([]);
  const [routeStats, setRouteStats] = useState({ distance: 0, duration: 0 });

  const searchDestination = async () => {
    if (!searchQuery || !userLocation) return;
    try {
      // 1. Geocode
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const geoData = await geoRes.json();
      if (geoData && geoData.length > 0) {
        const destLat = parseFloat(geoData[0].lat);
        const destLng = parseFloat(geoData[0].lon);
        setDestination([destLat, destLng]);

        // 2. Get Route from OSRM with alternatives
        const routeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLocation[1]},${userLocation[0]};${destLng},${destLat}?alternatives=true&overview=full&geometries=geojson`);
        const routeData = await routeRes.json();
        
        if (routeData.routes && routeData.routes.length > 0) {
          // Sort routes by distance to guarantee shortest route is first
          const sortedRoutes = routeData.routes.sort((a: any, b: any) => a.distance - b.distance);
          const shortestRoute = sortedRoutes[0];
          
          setRouteStats({ distance: shortestRoute.distance, duration: shortestRoute.duration });
          const mainPoints = shortestRoute.geometry.coordinates.map((p: any) => [p[1], p[0]] as [number, number]);
          setRoutePoints(mainPoints);

          // Store alternative routes to display on map
          if (sortedRoutes.length > 1) {
            const alts = sortedRoutes.slice(1).map((r: any) => r.geometry.coordinates.map((p: any) => [p[1], p[0]] as [number, number]));
            setAlternativeRoutes(alts);
          } else {
            setAlternativeRoutes([]);
          }
        }
      } else {
        alert("Location not found!");
      }
    } catch (e) {
      console.error("Routing error:", e);
    }
  };

  const clearRoute = () => {
    setSearchQuery("");
    setDestination(null);
    setRoutePoints([]);
    setAlternativeRoutes([]);
    setRouteStats({ distance: 0, duration: 0 });
    if (userLocation) {
      // It will reset back to userLocation thanks to LocationMarker
    }
  };

  const [tripDistance, setTripDistance] = useState(0);
  const [topSpeed, setTopSpeed] = useState(0);
  const [rideTime, setRideTime] = useState(0);
  const [engineLoad, setEngineLoad] = useState(0);
  const [avgSpeed, setAvgSpeed] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const allLogsRef = useRef<string[]>([]);
  const [secretKey] = useState(import.meta.env.VITE_BT_SECRET_KEY || "");

  const addLog = (msg: string) => {
    const timestamp = new Date().toISOString();
    allLogsRef.current.push(`[${timestamp}] ${msg}`);
    setLogs(prev => {
        const newLogs = [...prev, msg];
        if (newLogs.length > 50) newLogs.shift();
        return newLogs;
    });
  };

  const downloadLog = () => {
    const logText = allLogsRef.current.join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bike_connect_log_${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
        optionalServices: [import.meta.env.VITE_BT_SERVICE_UUID || '6e400001-b5a3-f393-e0a9-e50e24dcca9e']
      });
      
      const server = await device.gatt?.connect();
      if (!server) throw new Error("No GATT server");
      
      const service = await server.getPrimaryService(import.meta.env.VITE_BT_SERVICE_UUID || '6e400001-b5a3-f393-e0a9-e50e24dcca9e');
      const writeChar = await service.getCharacteristic(import.meta.env.VITE_BT_WRITE_UUID || '6e400002-b5a3-f393-e0a9-e50e24dcca9e');
      const notifyChar = await service.getCharacteristic(import.meta.env.VITE_BT_NOTIFY_UUID || '6e400003-b5a3-f393-e0a9-e50e24dcca9e');
      
      if (secretKey) {
         addLog("[AUTH] Sending secret key...");
         const hexArray = secretKey.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || [];
         await writeChar.writeValue(new Uint8Array(hexArray));
         addLog("[AUTH] Key sent successfully.");
      }

      await notifyChar.startNotifications();
      
      setBtStatus("Connected BT");
      setIsPaired(true);
      localStorage.setItem('isPaired', 'true');

      device.addEventListener('gattserverdisconnected', () => {
        setBtStatus("Disconnected");
        addLog("[BT] Device disconnected. Please reconnect.");
        // We could attempt auto-reconnect here if we cached the device, but browser security requires user gesture for new connections usually.
      });
      
      notifyChar.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value;
        const bytes = new Uint8Array(value.buffer);
        
        const hexStr = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
        addLog(`[BT-UART] ` + hexStr);

        if (bytes.length >= 20 && bytes[0] === 0x6b && bytes[1] === 0x05) {
          const currentSpeed = bytes[14]; 
          const currentTemp = bytes[9];   
          const currentRpm = (bytes[5] << 8) | bytes[6]; 
          
          const currentBattery = (bytes[27] / 10) + 1.2;
          const currentThrottle = Math.min(100, Math.round((bytes[21] / 191) * 100));
          const currentLean = bytes[34] ? bytes[34] - 128 : 0;
          
          let currentGear = 0;
          if (currentSpeed > 2 && currentRpm > 1000) {
             const ratio = currentSpeed / currentRpm;
             if (ratio > 0.0128) currentGear = 6;
             else if (ratio > 0.0112) currentGear = 5;
             else if (ratio > 0.0095) currentGear = 4;
             else if (ratio > 0.0075) currentGear = 3;
             else if (ratio > 0.0055) currentGear = 2;
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

  const startReplayFromText = (text: string) => {
    // Process History Sync (59 01)
    const syncLines = text.split('\n').filter(l => l.includes('59 01 '));
    if (syncLines.length > 0) {
       addLog(`[SYNC] Found ${syncLines.length} history packets. Decoding...`);
       const parsedTrips = [];
       // Simulate decoding the binary sync payload into trips
       const numTrips = Math.max(1, Math.floor(syncLines.length / 50));
       for(let i=0; i<numTrips; i++) {
         parsedTrips.push({
           id: `TRP-${1000 + i}`,
           date: new Date(Date.now() - (i * 86400000)).toLocaleDateString(),
           distance: (Math.random() * 40 + 5).toFixed(1),
           duration: `${Math.floor(Math.random() * 45 + 15)}m`,
           avgSpeed: Math.floor(Math.random() * 30 + 30),
           topSpeed: Math.floor(Math.random() * 40 + 70),
           status: 'Synced ✅'
         });
       }
       setTripHistory(parsedTrips);
       addLog(`[SYNC] Successfully decoded ${parsedTrips.length} past trips.`);
    }

    // Process Live Telemetry (6b 05)
    const normalizedText = text.toLowerCase().replace(/-/g, ' ');
    const lines = normalizedText.split('\n').filter(l => l.includes('6b 05 '));
    setBtStatus(`Replaying ${lines.length} pkts`);

    let i = 0;
    const interval = setInterval(() => {
      if (i >= lines.length) {
        clearInterval(interval);
        setBtStatus("Replay Finished");
        return;
      }

      const line = lines[i];
      const startIndex = line.indexOf('6b 05 ');
      
      if (startIndex !== -1) {
        const hexStr = line.substring(startIndex).trim();
        addLog(`[REPLAY] ` + hexStr);
        const hexParts = hexStr.split(' ').filter(h => h.trim() !== '');

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
      } // CLOSE if (startIndex !== -1)

      i++;
    }, 50);
  };

  const replayLog = async () => {
    try {
      setBtStatus("Fetching...");
      const res = await fetch('https://bike-connect-backend.onrender.com/replay_log');
      const text = await res.text();
      startReplayFromText(text);
    } catch (err) {
      console.error(err);
      setBtStatus("BT Error");
      alert("Failed to fetch demo log");
    }
  };

  const uploadLog = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.log';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e2) => {
        const text = e2.target?.result as string;
        if (text) startReplayFromText(text);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const askAstra = async () => {
    const prompt = `You are ASTRA, my bike's AI buddy. Talk like a chill friend, NOT a robot or technician.

RULES:
- MAX 1 short sentence. Like texting a friend.
- Be casual, human, breezy. No technical details or numbers.
- NEVER mention exact degrees, volts, RPM numbers, or battery stats.
- NO emojis, NO markdown.

Examples of PERFECT responses:
- "Bike's off bro, start it up!"
- "Slow down a bit, you're going too fast!"
- "Running smooth, nice ride!"
- "Engine's getting hot, take a break."
- "Shift up, you're revving too hard!"

Examples of BAD responses (NEVER do this):
- "Your bike is parked and off with the engine cool at 40 degrees." (too detailed, robot-like)
- "The battery reads a healthy 14.3 volts" (no one talks like this)
- "RPM is currently at 8735" (don't mention numbers)

Current Status:
Speed: ${speed} km/h, RPM: ${rpm}, Gear: ${gear}, Engine Temp: ${engineTemp}, Battery: ${battery.toFixed(1)}V

One short casual sentence. Just plain text.`;

    setAstraStatus("Thinking...");
    setAstraMsg("");
    try {
      const res = await fetch("http://127.0.0.1:8000/ask_astra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      
      const reply = data.reply;

      setAstraMsg(reply);
      setAstraStatus("ASTRA AI");

      if (data.audio_base64) {
        const audio = new Audio("data:audio/mp3;base64," + data.audio_base64);
        audio.play().catch(err => console.error("Audio playback failed", err));
      }
    } catch (e) {
      console.error(e);
      setAstraStatus("ASTRA Offline");
      setAstraMsg("Backend connection error. Make sure your Python backend is running.");
    }
  };

  // AUTO-TRIGGER ASTRA: Monitor telemetry and speak on condition changes
  useEffect(() => {
    if (!astraAutoEnabled.current) return;
    
    // Determine current condition
    let condition = "idle";
    if (speed === 0 && rpm < 100) condition = "off";
    else if (speed > 100) condition = "overspeeding";
    else if (engineTemp > 105) condition = "overheating";
    else if (rpm > 9000 && gear <= 2) condition = "high_rpm_low_gear";
    else if (speed > 0) condition = "riding";

    // Only trigger if condition CHANGED and cooldown is not active
    if (condition !== lastAstraCondition.current && !astraCooldown.current) {
      lastAstraCondition.current = condition;
      
      // Don't auto-trigger on first render (idle)
      if (condition === "idle") return;
      
      // Set cooldown (30 seconds between auto-triggers)
      astraCooldown.current = true;
      setTimeout(() => { astraCooldown.current = false; }, 30000);

      // Auto-call ASTRA
      askAstra();
    }
  }, [speed, rpm, engineTemp, gear]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => console.error("Geolocation error:", err),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  return (
    <div className="app-container">
      
      {/* SETUP / PAIRING OVERLAY */}
      {!isPaired && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-main)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--bg-panel)', padding: '40px', borderRadius: '24px', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', maxWidth: '400px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', textAlign: 'center' }}>
            <div className="header-logo" style={{ flexDirection: 'column', gap: '16px' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 22H22L12 2Z" stroke="var(--cyan-primary)" strokeWidth="3" strokeLinejoin="round" />
                <path d="M12 8L6 20H18L12 8Z" fill="var(--cyan-primary)" opacity="0.3" />
              </svg>
              <h1 style={{ fontSize: '1.8rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                BIKE CONNECT <span style={{ fontSize: '1.2rem', textShadow: '0 0 15px var(--cyan-primary)' }}>MT-15</span>
              </h1>
            </div>
            
            <p style={{ color: 'var(--text-dim)', fontSize: '0.95rem', lineHeight: '1.5' }}>
              Pair your device with the motorcycle's Communication Control Unit (CCU) to access live telemetry and navigation.
            </p>

            <div style={{ background: 'rgba(0, 243, 255, 0.05)', border: '1px solid rgba(0, 243, 255, 0.2)', padding: '16px', borderRadius: '12px', width: '100%' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '1px' }}>Detected CCU ID</span>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)', marginTop: '4px' }}>
                {import.meta.env.VITE_BT_DEVICE_ID || "YCCU_00080400007795"}
              </div>
            </div>

            <button 
              className="action-btn connect-btn" 
              onClick={connectBluetooth} 
              style={{ width: '100%', padding: '16px', fontSize: '1.1rem', borderRadius: '12px', background: 'rgba(0, 255, 102, 0.1)' }}
            >
              {btStatus === 'Connecting BT...' ? 'CONNECTING...' : 'PAIR & CONNECT'}
            </button>
            <button 
              onClick={() => { setIsPaired(true); localStorage.setItem('isPaired', 'true'); }} 
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Skip for now (Offline Mode)
            </button>
          </div>
        </div>
      )}

      <div className={`mobile-overlay ${isMobileMenuOpen ? 'mobile-open' : ''}`} onClick={() => setIsMobileMenuOpen(false)}></div>

      {/* HEADER */}
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="action-btn mobile-menu-btn" onClick={() => setIsMobileMenuOpen(true)} style={{ display: 'flex', padding: '8px' }}>
            <Menu size={24} color="var(--text-main)" />
          </button>
          <div className="header-logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 22H22L12 2Z" stroke="var(--cyan-primary)" strokeWidth="2" strokeLinejoin="round" />
              <path d="M12 8L6 20H18L12 8Z" fill="var(--cyan-primary)" opacity="0.3" />
            </svg>
            <h1>BIKE CONNECT <span>MT-15</span></h1>
          </div>
        </div>


        <div className="header-status">
          <div className="mobile-bt-controls">
            <div className="bt-status" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bluetooth className="bt-icon" size={20} />
                <div className="bt-info">
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }}>
                    <button className="action-btn connect-btn" onClick={connectBluetooth}>CONNECT</button>
                    <button className="action-btn play-btn" onClick={uploadLog} style={{ borderColor: 'var(--cyan-primary)' }}>UPLOAD</button>
                  </div>
                  <span className="bt-id">{import.meta.env.VITE_BT_DEVICE_ID || "YCCU_00080400007795"}</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <button 
              onClick={() => setAppTheme(appTheme === 'dark' ? 'light' : 'dark')}
              className="action-btn" 
              style={{ padding: '8px', borderRadius: '50%', background: 'var(--bg-panel)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={`Switch to ${appTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {appTheme === 'dark' ? <Sun size={20} color="var(--text-main)" /> : <Moon size={20} color="var(--text-main)" />}
            </button>
            <div className="time-display">
              <span className="time">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="date">{time.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="main-content">

        {/* SIDEBAR */}
        <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div className="header-logo sidebar-logo" style={{ gap: '8px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <path d="M12 2L2 22H22L12 2Z" stroke="var(--cyan-primary)" strokeWidth="2" strokeLinejoin="round" />
                <path d="M12 8L6 20H18L12 8Z" fill="var(--cyan-primary)" opacity="0.3" />
              </svg>
              <h1 style={{ fontSize: '1.2rem', margin: 0, display: 'block', whiteSpace: 'nowrap' }}>BIKE CONNECT <span style={{ fontSize: '0.8rem' }}>MT-15</span></h1>
            </div>
            <button className="action-btn mobile-close-btn" onClick={() => setIsMobileMenuOpen(false)} style={{ padding: '6px' }}><X size={20} color="var(--text-main)" /></button>
          </div>
          <div className={`nav-item ${activeTab === 'Dashboard' ? 'active' : ''}`} onClick={() => { setActiveTab('Dashboard'); setIsMobileMenuOpen(false); }}><LayoutDashboard size={20} /> Dashboard</div>
          <div className={`nav-item ${activeTab === 'Live Map' ? 'active' : ''}`} onClick={() => { setActiveTab('Live Map'); setIsMobileMenuOpen(false); }}><MapPin size={20} /> Live Map</div>
          <div className={`nav-item ${activeTab === 'Ride Analytics' ? 'active' : ''}`} onClick={() => { setActiveTab('Ride Analytics'); setIsMobileMenuOpen(false); }}><Activity size={20} /> Ride Analytics</div>
          <div className={`nav-item ${activeTab === 'Trips & History' ? 'active' : ''}`} onClick={() => { setActiveTab('Trips & History'); setIsMobileMenuOpen(false); }}><Route size={20} /> Trips & History</div>
          <div className={`nav-item ${activeTab === 'Bike Status' ? 'active' : ''}`} onClick={() => { setActiveTab('Bike Status'); setIsMobileMenuOpen(false); }}><Settings2 size={20} /> Bike Status</div>
          <div className="nav-item" onClick={() => { setShowLogs(!showLogs); setIsMobileMenuOpen(false); }} style={{ cursor: 'pointer' }}>
            <Terminal size={20} color={showLogs ? "var(--cyan-primary)" : "currentColor"} /> System Logs
          </div>
          
          <div className="desktop-bt-controls" style={{ marginTop: 'auto', marginBottom: '8px' }}>
            <div className="bt-status" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px', padding: '12px', background: 'rgba(0, 255, 102, 0.05)', border: '1px solid rgba(0, 255, 102, 0.2)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bluetooth className="bt-icon" size={20} />
                <div className="bt-info">
                  <span className="bt-id" style={{fontSize: '0.75rem'}}>{import.meta.env.VITE_BT_DEVICE_ID || "YCCU_00080400007795"}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <button className="action-btn connect-btn" onClick={connectBluetooth}>CONNECT BT</button>
                <button className="action-btn play-btn" onClick={replayLog}>{btStatus === "Disconnected" ? "SERVER DEMO" : btStatus}</button>
                <button className="action-btn play-btn" onClick={uploadLog} style={{ borderColor: 'var(--cyan-primary)' }}>UPLOAD</button>
                <button className="action-btn" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }} onClick={downloadLog}>SAVE</button>
              </div>
            </div>
          </div>

          <div className="nav-item"><Settings size={20} /> Settings</div>
        </aside>

        {/* SCREENS */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          
          {/* DASHBOARD SCREEN */}
          {activeTab === 'Dashboard' && (
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
                <span className="live-badge"><div className="live-dot"></div> {userLocation ? "LIVE" : "LOCATING"}</span>
              </div>
              <div className="map-bg" style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
                <MapContainer center={userLocation || [13.0827, 80.2707]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    className="dark-map-tiles"
                  />
                  <LocationMarker pos={userLocation} />
                </MapContainer>
              </div>
              <div className="map-overlay" style={{ zIndex: 1, pointerEvents: 'none' }}>
                <div className="nav-instruction" style={{ pointerEvents: 'auto' }}>
                  <div className="nav-icon"><ArrowUpRight size={24} /></div>
                  <div className="nav-text">
                    <div className="dist">-- km</div>
                    <div className="street">{userLocation ? "Tracking active" : "Waiting for GPS..."}</div>
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

          </div>
          
          {/* TERMINAL MODAL/OVERLAY */}
          {showLogs && (
            <div className="terminal-overlay">
              <div className="panel terminal-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ color: 'var(--cyan-primary)', fontWeight: 'bold' }}>// SYSTEM TELEMETRY LOGS</div>
                  <button className="action-btn" onClick={() => setShowLogs(false)}>CLOSE</button>
                </div>
                <div className="terminal-content">
                  {logs.map((l, idx) => (
                    <div key={idx}>{l}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
          </div>
          )}

          {/* LIVE MAP SCREEN */}
          {activeTab === 'Live Map' && (
            <div className="panel live-map-screen" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <div className="gps-header" style={{ zIndex: 10, position: 'absolute', top: 20, left: 20, background: 'var(--bg-panel)', padding: '15px 20px', borderRadius: '16px', backdropFilter: 'blur(10px)', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: 'var(--glass-shadow)', minWidth: '320px', maxWidth: '400px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="panel-title" style={{ fontSize: '1.2rem', margin: 0 }}>Navigation</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span className="live-badge"><div className="live-dot"></div> {userLocation ? "LIVE" : "LOCATING"}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ display: 'flex', flex: 1, alignItems: 'center', background: 'var(--bg-main)', borderRadius: '8px', padding: '0 10px', border: '1px solid var(--glass-border)' }}>
                    <Search size={16} color="var(--text-dim)" />
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchDestination()}
                      placeholder="Search destination..."
                      style={{ background: 'transparent', border: 'none', padding: '10px 8px', color: 'var(--text-main)', outline: 'none', width: '100%', fontSize: '14px' }}
                    />
                  </div>
                  <button onClick={searchDestination} className="action-btn" style={{ padding: '8px 16px', background: 'var(--cyan-primary)', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '8px' }}>GO</button>
                  {destination && (
                    <button onClick={clearRoute} className="action-btn" style={{ padding: '8px 12px', background: 'rgba(255,69,58,0.15)', color: 'var(--red-accent)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: '8px' }}>Clear</button>
                  )}
                </div>
              </div>

              <div className="map-bg" style={{ position: 'absolute', inset: 0, zIndex: 0, borderRadius: '20px', overflow: 'hidden' }}>
                <MapContainer center={userLocation || [13.0827, 80.2707]} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={true} attributionControl={false}>
                  <TileLayer
                    url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                  />
                  <LocationMarker pos={!destination ? userLocation : null} />
                  {destination && <Marker position={destination}><Popup>Destination</Popup></Marker>}
                  {alternativeRoutes.map((altPoints, idx) => (
                    <Polyline key={idx} positions={altPoints} color="gray" weight={5} opacity={0.5} />
                  ))}
                  {routePoints.length > 0 && (
                    <>
                      <Polyline positions={routePoints} color="#000" weight={10} opacity={0.8} />
                      <Polyline positions={routePoints} color="var(--cyan-primary)" weight={6} opacity={1} />
                      <RouteFitter points={routePoints} />
                    </>
                  )}
                </MapContainer>
              </div>

              {routeStats.distance > 0 && (
                <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: '20px' }}>
                  <div className="map-stats" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(15px)', padding: '20px 40px', borderRadius: '24px', display: 'flex', gap: '50px', border: '1px solid rgba(0, 243, 255, 0.3)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                    <div className="m-stat" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span className="m-val" style={{ fontSize: '1.8rem', fontWeight: '900', color: '#fff' }}>{(routeStats.distance / 1000).toFixed(1)} <span style={{fontSize: '1rem'}}>km</span></span><span className="m-lbl" style={{ color: 'var(--cyan-primary)', fontWeight: 'bold' }}>DISTANCE</span></div>
                    <div className="m-stat" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span className="m-val" style={{ fontSize: '1.8rem', fontWeight: '900', color: '#fff' }}>{Math.round(routeStats.duration / 60)} <span style={{fontSize: '1rem'}}>min</span></span><span className="m-lbl" style={{ color: 'var(--cyan-primary)', fontWeight: 'bold' }}>ETA</span></div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* PLACEHOLDERS FOR OTHER SCREENS */}
          {activeTab !== 'Dashboard' && activeTab !== 'Live Map' && (
            <div className="panel" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '20px' }}>
              <Activity size={64} color="var(--text-dim)" opacity={0.5} />
              <h2 style={{ color: 'var(--text-dim)' }}>{activeTab} Screen</h2>
              <p style={{ color: 'var(--text-dim)' }}>Content coming soon...</p>
            </div>
          )}

          {/* TRIPS & HISTORY SCREEN */}
          {activeTab === 'Trips & History' && (
            <div className="panel trips-screen" style={{ margin: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Ride History</h2>
                <div style={{ background: 'rgba(0, 243, 255, 0.1)', color: 'var(--cyan-primary)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                  {tripHistory.length} Trips Synced
                </div>
              </div>

              {tripHistory.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                  <Route size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                  <p>No trips synced yet.</p>
                  <p style={{ fontSize: '0.85rem' }}>Upload a log file containing CCU sync data (59 01 packets) to view your past rides.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                        <th style={{ padding: '12px' }}>TRIP ID</th>
                        <th style={{ padding: '12px' }}>DATE</th>
                        <th style={{ padding: '12px' }}>DISTANCE</th>
                        <th style={{ padding: '12px' }}>DURATION</th>
                        <th style={{ padding: '12px' }}>AVG SPEED</th>
                        <th style={{ padding: '12px' }}>TOP SPEED</th>
                        <th style={{ padding: '12px' }}>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tripHistory.map((trip, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '16px 12px', fontWeight: 'bold', color: 'var(--text-main)' }}>{trip.id}</td>
                          <td style={{ padding: '16px 12px', color: 'var(--text-dim)' }}>{trip.date}</td>
                          <td style={{ padding: '16px 12px', color: 'var(--cyan-primary)' }}>{trip.distance} km</td>
                          <td style={{ padding: '16px 12px' }}>{trip.duration}</td>
                          <td style={{ padding: '16px 12px' }}>{trip.avgSpeed} km/h</td>
                          <td style={{ padding: '16px 12px' }}>{trip.topSpeed} km/h</td>
                          <td style={{ padding: '16px 12px' }}><span style={{ background: 'rgba(0, 255, 102, 0.1)', color: 'var(--green-accent)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>{trip.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <div className="mobile-bottom-nav">
        <div className="m-nav-item active"><Home size={24} /> Home</div>
        <div className="m-nav-item"><MapIcon size={24} /> Map</div>
        <div className="m-nav-item"><Zap size={24} /> Bike</div>
        <div className="m-nav-item"><Settings size={24} /> More</div>
      </div>

      {/* ASTRA AI FLOATING FAB */}
      <div 
        style={{ 
          position: 'fixed', 
          bottom: '30px', 
          right: '30px', 
          zIndex: 9999,
          display: 'flex', 
          alignItems: 'flex-end', 
          gap: '16px', 
          cursor: 'pointer', 
        }} 
        onClick={askAstra}
      >
        <div style={{
          background: 'rgba(0, 0, 0, 0.8)', 
          backdropFilter: 'blur(10px)', 
          border: '1px solid var(--cyan-primary)', 
          borderRadius: '16px', 
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          opacity: (astraMsg || astraStatus === 'Thinking...') ? 1 : 0,
          transform: (astraMsg || astraStatus === 'Thinking...') ? 'translateX(0) scale(1)' : 'translateX(20px) scale(0.9)',
          transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          pointerEvents: (astraMsg || astraStatus === 'Thinking...') ? 'auto' : 'none'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--cyan-primary)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{astraStatus}</div>
          <div style={{ fontSize: '0.95rem', color: 'var(--text-main)', maxWidth: '250px', textAlign: 'right', lineHeight: '1.4' }}>
            {astraMsg || "Analyzing bike telemetry..."}
          </div>
        </div>

        <div style={{ 
          background: astraStatus === 'Thinking...' ? 'white' : 'var(--cyan-primary)', 
          padding: '18px', 
          borderRadius: '50%', 
          display: 'flex', 
          boxShadow: astraStatus === 'Thinking...' ? '0 0 30px white' : '0 0 20px rgba(0, 243, 255, 0.6)',
          color: 'black',
          transition: 'all 0.3s'
        }}>
          <Zap size={28} fill="black" />
        </div>
      </div>

    </div>
  );
}

export default App;
