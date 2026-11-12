
import { useState } from "react";
import "./App.css";
import WindowControls from "./WindowControls";

const menu = [
  ["Áttekintés", "◈"],
  ["Processzor", "▦"],
  ["Grafikus vezérlő", "▧"],
  ["Memória", "▤"],
  ["Háttértárak", "▣"],
  ["Hűtés", "✣"],
  ["Teljesítmény", "⌁"],
  ["Guardian", "⬡"],
];

function ArcGauge({ value, color, label }: { value: number; color: string; label: string }) {
  const circumference = 251.2;
  return (
    <div className="arc-gauge">
      <svg viewBox="0 0 200 116">
        <path d="M 18 103 A 82 82 0 0 1 182 103" className="arc-track" />
        <path
          d="M 18 103 A 82 82 0 0 1 182 103"
          className="arc-value"
          style={{
            stroke: color,
            strokeDasharray: `${circumference * value / 100} ${circumference}`,
            filter: `drop-shadow(0 0 8px ${color})`,
          }}
        />
      </svg>
      <div className="arc-reading">
        <strong>{value}<small>%</small></strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}<small>{unit}</small></strong>
    </div>
  );
}

function App() {
  const [active, setActive] = useState("Áttekintés");
  const [theme, setTheme] = useState("blue");

  const pageTitles: Record<string, string> = {
    "Áttekintés": "Rendszerközpont",
    "Processzor": "Processzor felügyelet",
    "Grafikus vezérlő": "GPU felügyelet",
    "Memória": "Memória felügyelet",
    "Háttértárak": "Háttértár felügyelet",
    "Hűtés": "Hűtésvezérlés",
    "Teljesítmény": "Teljesítményközpont",
    "Guardian": "NEXUS Guardian",
    "Rendszer és Windows": "Rendszerinformációk",
    "Beállítások": "Beállítások",
  };

  return (
    <main className={`nexus-shell theme-${theme}`}>
      <aside className="side-rail">
        <div className="logo-lockup">
          <div className="nexus-symbol"><span>N</span></div>
          <div><b>NEXUS</b><small>HARDWARE INTELLIGENCE</small></div>
        </div>

        <div className="nav-caption">CONTROL CENTER</div>
        <nav className="main-nav">
          {menu.map(([name, icon], index) => (
            <button key={name} className={active === name ? "nav-link selected" : "nav-link"} onClick={() => setActive(name)}>
              <span className="nav-symbol">{icon}</span>
              <span>{name}</span>
              {index === 7 && <i className="alert-count">1</i>}
            </button>
          ))}
        </nav>

        <div className="rail-bottom">
          <div className="nav-caption">RENDSZER</div>
          <button className="nav-link" onClick={() => setActive("Rendszer és Windows")}>
            <span className="nav-symbol">⌘</span><span>Rendszer és Windows</span>
          </button>
          <button className="nav-link" onClick={() => setActive("Beállítások")}>
            <span className="nav-symbol">⚙</span><span>Beállítások</span>
          </button>
          <div className="connection-card">
            <span className="connection-light" />
            <div><b>CORE ENGINE</b><small>Demó üzemmód</small></div>
            <span className="connection-state">ONLINE</span>
          </div>
          <div className="rail-version">NEXUS / BUILD 0.1.0</div>
        </div>
      </aside>

      <section className="workspace">
        <header className="top-header">
          <div className="header-path" data-tauri-drag-region><span> NEXUS </span><i>/</i><b>{active}</b></div>
          <div className="header-tools">
            <div className="demo-tag"><span /> SIMULATED DATA</div>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Megjelenési téma">
              <option value="blue">NEON BLUE</option>
              <option value="purple">CYBER PURPLE</option>
              <option value="green">MATRIX GREEN</option>
              <option value="red">REDLINE</option>
              <option value="ice">ICE WHITE</option>
            </select>
            <div className="profile-mark">NX</div>
          </div>
          <WindowControls />
        </header>

        <div className="dashboard">
          <div className="welcome-row">
            <div>
              <div className="section-kicker"><span /> SYSTEM MONITORING INTERFACE</div>
              <h1>{pageTitles[active] ?? active}</h1>
              <p>Hardvered és rendszered állapota egyetlen központi felületen.</p>
            </div>
            <div className="uptime-box">
              <span>RENDSZERÜZEMIDŐ</span>
              <b>04 <small>NAP</small> 08 <small>ÓRA</small> 32 <small>PERC</small></b>
            </div>
          </div>

          <section className="health-strip">
            <div className="health-emblem">✧</div>
            <div className="health-text">
              <span>CORE SYSTEM STATUS</span>
              <b>Rendszerállapot: stabil</b>
              <small>A bemutató adatok alapján nincs észlelt kritikus probléma.</small>
            </div>
            <div className="health-score">
              <strong>98<span>/100</span></strong>
              <small>SYSTEM HEALTH INDEX</small>
            </div>
            <div className="health-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          </section>

          <div className="section-title">
            <div><span className="section-kicker">LIVE HARDWARE TELEMETRY</span><h2>Hardverállapot</h2></div>
            <span className="sample-label"><i /> DEMÓ MÉRÉSEK</span>
          </div>

          <section className="hero-grid">
            <article className="device-panel cpu-panel">
              <div className="device-heading">
                <div className="device-icon">▦</div>
                <div><span>PROCESSZOR / CPU</span><h3>AMD Ryzen 5 5600G</h3></div>
                <span className="device-live">LIVE</span>
              </div>
              <div className="device-main">
                <ArcGauge value={34} color="var(--accent)" label="CPU LOAD" />
                <div className="device-metrics">
                  <Metric label="HŐMÉRSÉKLET" value="42" unit="°C" />
                  <Metric label="ÓRAJEL" value="4.20" unit="GHz" />
                  <Metric label="FOGYASZTÁS" value="48" unit="W" />
                  <Metric label="MAGOK" value="6" />
                </div>
              </div>
              <div className="device-footer"><span>PROCESSZOR TERHELÉS</span><b>34%</b></div>
              <div className="mini-bars">{Array.from({ length: 38 }, (_, i) => <i key={i} style={{ height: `${15 + ((i * 17 + 23) % 72)}%` }} />)}</div>
            </article>

            <article className="device-panel gpu-panel">
              <div className="device-heading">
                <div className="device-icon purple-icon">▧</div>
                <div><span>GRAFIKUS VEZÉRLŐ / GPU</span><h3>NVIDIA GeForce RTX 3060 Ti</h3></div>
                <span className="device-live">LIVE</span>
              </div>
              <div className="device-main">
                <ArcGauge value={62} color="#a98aff" label="GPU LOAD" />
                <div className="device-metrics">
                  <Metric label="HŐMÉRSÉKLET" value="58" unit="°C" />
                  <Metric label="ÓRAJEL" value="1845" unit="MHz" />
                  <Metric label="VRAM" value="5.8" unit="GB" />
                  <Metric label="FOGYASZTÁS" value="162" unit="W" />
                </div>
              </div>
              <div className="device-footer"><span>GPU TERHELÉS</span><b>62%</b></div>
              <div className="mini-bars purple-bars">{Array.from({ length: 38 }, (_, i) => <i key={i} style={{ height: `${20 + ((i * 23 + 11) % 70)}%` }} />)}</div>
            </article>
          </section>

          <section className="secondary-grid">
            <article className="info-panel">
              <div className="info-title"><span className="memory-icon">▤</span><div><b>RENDSZERMEMÓRIA</b><small>DDR4 · 3200 MHz</small></div><strong>48%</strong></div>
              <div className="memory-number">15.4 <small>GB</small><span>/ 32 GB</span></div>
              <div className="progress-track"><i style={{ width: "48%" }} /></div>
              <div className="info-foot"><span>HASZNÁLT: 15.4 GB</span><span>ELÉRHETŐ: 16.6 GB</span></div>
            </article>

            <article className="info-panel">
              <div className="info-title"><span className="storage-icon">▣</span><div><b>HÁTTÉRTÁRAK</b><small>NVMe SSD</small></div><strong>27%</strong></div>
              <div className="memory-number">1.2 <small>TB</small><span>használt tárhely</span></div>
              <div className="progress-track storage-track"><i style={{ width: "27%" }} /></div>
              <div className="info-foot"><span>MEGHAJTÓ AKTIVITÁS</span><span>DEMO DRIVE</span></div>
            </article>

            <article className="info-panel cooling-panel">
              <div className="info-title"><span className="cooling-icon">✣</span><div><b>HŰTÉSI RENDSZER</b><small>Ventilátor-felügyelet</small></div><span className="cooling-status">STABIL</span></div>
              <div className="fan-row"><div className="fan-graphic">✣</div><div><b>CPU FAN</b><small>Processzorhűtő</small></div><strong>1240 <small>RPM</small></strong></div>
              <div className="fan-row"><div className="fan-graphic purple-fan">✣</div><div><b>GPU FAN</b><small>Videokártya</small></div><strong>980 <small>RPM</small></strong></div>
            </article>
          </section>

          <section className="bottom-section">
            <div className="section-title">
              <div><span className="section-kicker">SYSTEM ACTIVITY</span><h2>Teljesítmény-előzmények</h2></div>
              <span className="sample-label">UTOLSÓ 60 PERC</span>
            </div>
            <div className="history-panel">
              <div className="history-legend"><span><i /> CPU TERHELÉS</span><span><i /> GPU TERHELÉS</span></div>
              <svg viewBox="0 0 1000 130" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".22"/><stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/></linearGradient>
                </defs>
                <path d="M0 85 C70 75 85 100 150 68 S240 82 300 60 S380 75 450 44 S550 75 620 52 S720 70 790 30 S900 52 1000 22 L1000 130 L0 130Z" fill="url(#lineFill)"/>
                <path d="M0 85 C70 75 85 100 150 68 S240 82 300 60 S380 75 450 44 S550 75 620 52 S720 70 790 30 S900 52 1000 22" fill="none" stroke="var(--accent)" strokeWidth="2.5"/>
                <path d="M0 105 C80 100 100 112 170 92 S260 105 330 85 S430 100 500 76 S600 96 680 78 S780 90 850 65 S940 77 1000 55" fill="none" stroke="#a98aff" strokeWidth="2"/>
              </svg>
              <div className="history-times"><span>18:00</span><span>18:15</span><span>18:30</span><span>18:45</span><span>19:00</span></div>
            </div>
          </section>

          <footer className="dashboard-footer"><span>NEXUS HARDWARE INTELLIGENCE</span><span><i /> INTERFACE ONLINE <b>·</b> DEMO DATA MODE</span></footer>
        </div>
      </section>
    </main>
  );
}

export default App;
