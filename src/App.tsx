import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import "./App.css";

import WindowControls from "./WindowControls";

const navigation = [
  { group: "FŐMENÜ", items: [["Áttekintés", "⌂"], ["Processzor", "▦"], ["Grafikus vezérlő", "▧"], ["Memória", "▤"], ["Háttértárak", "▣"]] },
  { group: "ESZKÖZÖK", items: [["Hűtés", "✣"], ["Ventilátorvezérlés", "◉"], ["Teljesítmény", "⌁"], ["Guardian", "⬡"]] },
];
const themes = [
  { value: "blue", label: "NEON BLUE" },
  { value: "purple", label: "CYBER PURPLE" },
  { value: "green", label: "MATRIX GREEN" },
  { value: "red", label: "REDLINE" },
  { value: "ice", label: "ICE WHITE" },
] as const;
type Theme = typeof themes[number]["value"];
function readSavedTheme(): Theme {
  try {
    const saved = window.localStorage.getItem("nexus-theme");
    return themes.find(theme => theme.value === saved)?.value ?? "blue";
  } catch {
    return "blue";
  }
}

type DiagnosticsThresholds = { cpuWarning: number; cpuCritical: number; gpuWarning: number; gpuCritical: number; memoryWarning: number; memoryCritical: number; storageWarning: number; storageCritical: number };
type ThresholdDraft = { [K in keyof DiagnosticsThresholds]: string };
const recommendedThresholds: DiagnosticsThresholds = { cpuWarning: 85, cpuCritical: 95, gpuWarning: 85, gpuCritical: 95, memoryWarning: 90, memoryCritical: 97, storageWarning: 70, storageCritical: 80 };

function isValidThresholds(value: DiagnosticsThresholds): boolean {
  return Number.isInteger(value.cpuWarning) && value.cpuWarning >= 40 && value.cpuWarning <= 110 && value.cpuCritical > value.cpuWarning && value.cpuCritical <= 120 &&
    Number.isInteger(value.gpuWarning) && value.gpuWarning >= 40 && value.gpuWarning <= 110 && value.gpuCritical > value.gpuWarning && value.gpuCritical <= 120 &&
    Number.isInteger(value.memoryWarning) && value.memoryWarning >= 50 && value.memoryWarning <= 99 && value.memoryCritical > value.memoryWarning && value.memoryCritical <= 100 &&
    Number.isInteger(value.storageWarning) && value.storageWarning >= 30 && value.storageWarning <= 100 && value.storageCritical > value.storageWarning && value.storageCritical <= 120;
}

function toThresholdDraft(value: DiagnosticsThresholds): ThresholdDraft {
  return Object.fromEntries(Object.entries(value).map(([key, number]) => [key, String(number)])) as ThresholdDraft;
}

function parseThresholdDraft(draft: ThresholdDraft): DiagnosticsThresholds | null {
  if (Object.values(draft).some(value => value.trim() === "")) return null;
  const value: DiagnosticsThresholds = {
    cpuWarning: Number(draft.cpuWarning), cpuCritical: Number(draft.cpuCritical),
    gpuWarning: Number(draft.gpuWarning), gpuCritical: Number(draft.gpuCritical),
    memoryWarning: Number(draft.memoryWarning), memoryCritical: Number(draft.memoryCritical),
    storageWarning: Number(draft.storageWarning), storageCritical: Number(draft.storageCritical),
  };
  return isValidThresholds(value) ? value : null;
}

type Sensor = { Name?: string; SensorType?: string; Value?: number | null; Status?: string; Identifier?: string; CanControl?: boolean; MinimumControlValue?: number | null; MaximumControlValue?: number | null; ControlMode?: string | null };
type Device = { Name?: string; HardwareType?: string; Sensors?: Sensor[] };
type CpuCoreReading = { number: number; load: number | null; clock: number | null; temperature: number | null };
type HardwareControlChannel = { deviceName: string; name: string; identifier: string; value: number | null; canControl: boolean; minimum: number | null; maximum: number | null; mode: string; fanRpm: number | null; hasFanSensor: boolean };
function NativeFanControlChannel({ channel }: { channel: HardwareControlChannel }) {
  const minimum = channel.minimum ?? 0;
  const maximum = channel.maximum ?? 100;
  const initial = Math.min(maximum, Math.max(minimum, 50));
  const [target, setTarget] = useState(initial);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (value: number | null) => {
    setBusy(true);
    setStatus(value === null ? "Alapértelmezett mód visszaállítása…" : "Sebesség alkalmazása…");
    try {
      const response = await invoke<string>("set_fan_control", { sensorIdentifier: channel.identifier, value });
      setStatus(response);
    } catch (error) {
      setStatus("Nem sikerült: " + String(error));
    } finally {
      setBusy(false);
    }
  };
  return <article className="fan-control-native-card">
    <div className="fan-control-native-card-head"><div><strong>{channel.name}</strong><small>{channel.deviceName}</small></div><span className={channel.canControl ? "is-writable" : "is-readonly"}>{channel.canControl ? "KIMENET TÁMOGATOTT" : "CSAK OLVASHATÓ"}</span></div>
    <div className="fan-control-native-current"><span>Jelenlegi kimenet</span><b>{display(channel.value, "%", 1)}</b><small>mód: {channel.mode}</small></div>
    <div className={"fan-control-native-feedback" + (channel.fanRpm === 0 ? " has-zero-rpm" : "")}>{channel.hasFanSensor ? channel.fanRpm === null ? "RPM-visszajelzés: N/A" : channel.fanRpm === 0 ? "0 RPM · nincs forgásjel (lehet üres csatlakozó)" : "Fordulatszám: " + display(channel.fanRpm, " RPM", 0) : "Nincs párosított RPM-szenzor"}</div>
    {channel.canControl && <div className="fan-control-native-actions">
      <label><span>Új érték · {target.toFixed(0)}%</span><input type="range" min={minimum} max={maximum} step="1" value={target} onChange={event => setTarget(Number(event.target.value))} /></label>
      <div><button type="button" disabled={busy || !channel.identifier} onClick={() => void send(target)}>Alkalmaz</button><button className="fan-control-native-reset" type="button" disabled={busy || !channel.identifier} onClick={() => void send(null)}>Hardver alapbeállítás</button></div>
      {status && <small className="fan-control-native-status" role="status">{status}</small>}
    </div>}
  </article>;
}
type GuardianEvent = { Id: string; Device: string; Sensor: string; Severity: string; Message: string; StartedAt: string; IsActive: boolean; ResolvedAt?: string | null };
type HealthReport = { Score: number | null; CoveragePercent: number; Status: string; Reasons: string[] };
type WindowsInfo = { WindowsEdition?: string | null; WindowsVersion?: string | null; Manufacturer?: string | null; Model?: string | null; SystemType?: string | null; UsableMemoryGb?: number | null; IsActivated?: boolean | null };
type Snapshot = { Timestamp?: string; ComputerName?: string; OperatingSystem?: string; Architecture?: string; LogicalProcessorCount?: number; WindowsInfo?: WindowsInfo; Devices?: Device[]; Health?: HealthReport; GuardianEvents?: GuardianEvent[] };
type PerformanceSample = { timestamp: string; cpuLoad: number | null; cpuTemp: number | null; gpuLoad: number | null; gpuTemp: number | null; memoryLoad: number | null };
type PerformanceKey = "cpuLoad" | "cpuTemp" | "gpuLoad" | "gpuTemp" | "memoryLoad";
type PerformanceSeries = { key: PerformanceKey; label: string; color: string };
type CoolingTimeRange = 1 | 5 | 15 | 30 | 60;
type CoolingTemperatureScale = "auto" | "60" | "80" | "100" | "120";
type CoolingPreferences = { historyMinutes: CoolingTimeRange; temperatureScale: CoolingTemperatureScale; showSensorDetails: boolean; seriesColors: Record<string, string> };
type CoolingTrendSample = { timestamp: string; values: Record<string, number | null> };
type CoolingTrendSeries = { key: string; label: string; color: string; value: number | null };
type CoolingTemperatureReading = CoolingTrendSeries & { value: number | null; warning: number; critical: number; hasSensor: boolean };
type CoolingDetailRow = { deviceName: string; deviceIndex: number; sensor: Sensor | null; sensorIndex: number };
const coolingTimeRanges: CoolingTimeRange[] = [1, 5, 15, 30, 60];
const coolingTemperatureScales: CoolingTemperatureScale[] = ["auto", "60", "80", "100", "120"];
function readSavedCoolingPreferences(): CoolingPreferences {
  const defaults: CoolingPreferences = { historyMinutes: 5, temperatureScale: "auto", showSensorDetails: false, seriesColors: {} };
  try {
    const saved = JSON.parse(window.localStorage.getItem("nexus-cooling-preferences") ?? "null") as Partial<CoolingPreferences> | null;
    const seriesColors = saved?.seriesColors && typeof saved.seriesColors === "object"
      ? Object.fromEntries(Object.entries(saved.seriesColors).filter(([, color]) => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color))) as Record<string, string>
      : defaults.seriesColors;
    return {
      historyMinutes: coolingTimeRanges.includes(saved?.historyMinutes as CoolingTimeRange) ? saved!.historyMinutes! : defaults.historyMinutes,
      temperatureScale: coolingTemperatureScales.includes(saved?.temperatureScale as CoolingTemperatureScale) ? saved!.temperatureScale! : defaults.temperatureScale,
      showSensorDetails: typeof saved?.showSensorDetails === "boolean" ? saved.showSensorDetails : defaults.showSensorDetails,
      seriesColors,
    };
  } catch {
    return defaults;
  }
}

function readField<T>(obj: any, pascal: string, camel: string): T | undefined {
  return (obj?.[pascal] ?? obj?.[camel]) as T | undefined;
}
function findDevice(snapshot: Snapshot | null, type: string) {
  return (snapshot?.Devices ?? []).find(d => readField<string>(d, "HardwareType", "hardwareType")?.toLowerCase() === type.toLowerCase());
}
function findSensor(device: Device | undefined, names: string[], type?: string): number | null {
  const sensors = device ? (readField<Sensor[]>(device, "Sensors", "sensors") ?? []) : [];
  const candidates = sensors.filter(sensor => {
    const sensorType = readField<string>(sensor, "SensorType", "sensorType");
    const sensorValue = readField<number | null>(sensor, "Value", "value");
    const status = readField<string>(sensor, "Status", "status");
    const name = readField<string>(sensor, "Name", "name") ?? "";
    const thresholdOnly = /warning|critical|threshold/i.test(name);
    return (!type || sensorType?.toLowerCase() === type.toLowerCase()) &&
      typeof sensorValue === "number" && Number.isFinite(sensorValue) && status !== "Invalid" && status !== "Unavailable" && !thresholdOnly;
  });

  // Prefer exact sensor-name matches, then fall back to a partial match.
  const normalized = names.map(name => name.toLowerCase());
  const found =
    candidates.find(sensor => normalized.includes((readField<string>(sensor, "Name", "name") ?? "").toLowerCase())) ??
    candidates.find(sensor => {
      const name = (readField<string>(sensor, "Name", "name") ?? "").toLowerCase();
      return normalized.some(candidate => name.includes(candidate));
    });

  const value = found ? readField<number | null>(found, "Value", "value") : null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function findSensorEntry(device: Device | undefined, names: string[], type: string): Sensor | null {
  const sensors = device ? (readField<Sensor[]>(device, "Sensors", "sensors") ?? []) : [];
  const candidates = sensors.filter(sensor => {
    const sensorType = readField<string>(sensor, "SensorType", "sensorType");
    const sensorValue = readField<number | null>(sensor, "Value", "value");
    const status = readField<string>(sensor, "Status", "status");
    const name = readField<string>(sensor, "Name", "name") ?? "";
    return sensorType?.toLowerCase() === type.toLowerCase() && typeof sensorValue === "number" && Number.isFinite(sensorValue) && status !== "Invalid" && status !== "Unavailable" && !/warning|critical|threshold/i.test(name);
  });
  const normalized = names.map(name => name.toLowerCase());
  return candidates.find(sensor => normalized.includes((readField<string>(sensor, "Name", "name") ?? "").toLowerCase())) ??
    candidates.find(sensor => {
      const name = (readField<string>(sensor, "Name", "name") ?? "").toLowerCase();
      return normalized.some(candidate => name.includes(candidate));
    }) ?? null;
}
function display(value: number | null, suffix = "", decimals = 0) {
  return value === null ? "N/A" : `${value.toFixed(decimals)}${suffix}`;
}

function formatMemoryGiB(value: number | null): string {
  return value === null ? "N/A" : value.toFixed(1) + " GiB";
}
function formatMemoryMiBAsGiB(value: number | null): string {
  return value === null ? "N/A" : (value / 1024).toFixed(1) + " GiB";
}
function translateSensorName(name: string): string {
  const known: Record<string, string> = {
    "gpu core": "GPU-mag", "gpu memory": "GPU-memória",
    "gpu memory used": "Használt VRAM", "gpu memory free": "Szabad VRAM", "gpu memory total": "Teljes VRAM",
    "memory used": "Használt memória", "memory available": "Szabad memória",
    "total space": "Teljes kapacitás", "free space": "Szabad hely", "used space": "Foglalt hely",
    "composite": "Összesített hőmérséklet", "composite temperature": "Összesített hőmérséklet",
    "drive temperature": "Meghajtó-hőmérséklet", "temperature": "Hőmérséklet",
    "life": "Hátralévő élettartam", "data read": "Olvasott adatmennyiség", "data written": "Írt adatmennyiség",
    "power on count": "Bekapcsolások száma", "power on hours": "Üzemóra",
    "read activity": "Olvasási aktivitás", "write activity": "Írási aktivitás", "total activity": "Összes aktivitás",
    "cpu package": "CPU-csomag", "cpu total": "Teljes CPU-terhelés",
  };
  return known[name.trim().toLowerCase()] ?? name;
}
function translateSensorType(type: string | undefined): string {
  const known: Record<string, string> = {
    temperature: "Hőmérséklet", load: "Terhelés", control: "Vezérlés", level: "Szint",
    fan: "Ventilátor", clock: "Órajel", power: "Teljesítmény", voltage: "Feszültség",
    data: "Adat (GiB)", smalldata: "Memóriaadat (MiB)", current: "Áramerősség", factor: "Arány",
    throughput: "Adatátvitel",
  };
  return type ? known[type.toLowerCase()] ?? type : "Szenzor";
}
function translateSensorStatus(status: string | undefined): string {
  if (status === "Available") return "Elérhető";
  if (status === "Invalid") return "Érvénytelen";
  if (status === "Unavailable") return "Nem érhető el";
  return status ?? "Ismeretlen állapot";
}
function formatSensorValue(sensor: Sensor): string {
  const value = readField<number | null>(sensor, "Value", "value");
  const status = readField<string>(sensor, "Status", "status");
  if (typeof value !== "number" || !Number.isFinite(value) || status !== "Available") return "N/A";

  const sensorType = readField<string>(sensor, "SensorType", "sensorType")?.toLowerCase();
  const units: Record<string, string> = {
    temperature: "°C", load: "%", control: "%", level: "%",
    fan: "RPM", clock: "MHz", power: "W", voltage: "V", smalldata: "MiB",
  };
  const unit = sensorType ? units[sensorType] : undefined;
  return `${value.toFixed(1)}${unit ? ` ${unit}` : ""}`;
}

function chartTimeLabel(timestamp: string | undefined): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function PerformanceChart({ title, unit, samples, series, maxValue = 100 }: { title: string; unit: string; samples: PerformanceSample[]; series: PerformanceSeries[]; maxValue?: number }) {
  const width = 720;
  const height = 205;
  const left = 42;
  const right = 12;
  const top = 14;
  const bottom = 27;
  const graphWidth = width - left - right;
  const graphHeight = height - top - bottom;
  const plotted = series.map(item => {
    let path = "";
    let activeSegment = false;
    const points: { x: number; y: number }[] = [];
    samples.forEach((sample, index) => {
      const value = sample[item.key];
      if (value === null || !Number.isFinite(value)) { activeSegment = false; return; }
      const x = samples.length < 2 ? left + graphWidth : left + (index / (samples.length - 1)) * graphWidth;
      const clamped = Math.max(0, Math.min(maxValue, value));
      const y = top + graphHeight - (clamped / maxValue) * graphHeight;
      path += (activeSegment ? " L " : " M ") + x.toFixed(1) + " " + y.toFixed(1);
      activeSegment = true;
      points.push({ x, y });
    });
    return { ...item, path, latest: points.length > 0 ? points[points.length - 1] : null };
  });
  const hasData = plotted.some(item => item.latest !== null);
  const ticks = [0, 50, 100];
  return (
    <section className="performance-chart-card">
      <header className="performance-chart-header"><div><h2>{title}</h2><small>Utolsó 60 minta · frissítés másodpercenként</small></div><small>{samples.length} / 60</small></header>
      {!hasData ? <div className="performance-chart-empty">Ehhez a grafikonhoz most nincs elérhető szenzoradat.</div> : <>
        <svg className="performance-chart-svg" viewBox={"0 0 " + width + " " + height} role="img" aria-label={title}>
          {ticks.map(tick => {
            const y = top + graphHeight - (tick / 100) * graphHeight;
            return <g key={tick}><line x1={left} y1={y} x2={width - right} y2={y} className="performance-grid-line" /><text x={left - 7} y={y + 3} textAnchor="end" className="performance-axis-label">{Math.round((tick / 100) * maxValue)}{unit}</text></g>;
          })}
          <text x={left} y={height - 5} textAnchor="start" className="performance-axis-label">{chartTimeLabel(samples[0]?.timestamp)}</text>
          <text x={width - right} y={height - 5} textAnchor="end" className="performance-axis-label">{chartTimeLabel(samples[samples.length - 1]?.timestamp)}</text>
          {plotted.map(item => item.path && <path key={item.key} d={item.path} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
          {plotted.map(item => item.latest && <circle key={item.key + "-current"} cx={item.latest.x} cy={item.latest.y} r="4" fill={item.color} />)}
        </svg>
        <div className="performance-legend">{series.map(item => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
      </>}
    </section>
  );
}

function CoolingTemperatureChart({ samples, series, historyMinutes, temperatureScale, onColorChange }: { samples: CoolingTrendSample[]; series: CoolingTrendSeries[]; historyMinutes: CoolingTimeRange; temperatureScale: CoolingTemperatureScale; onColorChange: (key: string, color: string) => void }) {
  const width = 720;
  const height = 205;
  const left = 48;
  const right = 12;
  const top = 14;
  const bottom = 27;
  const graphWidth = width - left - right;
  const graphHeight = height - top - bottom;
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([]);
  const [hovered, setHovered] = useState<{ timestamp: string; left: number; top: number; plotX: number; values: Array<{ key: string; label: string; color: string; value: number | null }> } | null>(null);
  const visibleSeries = series.filter(item => !hiddenSeries.includes(item.key));
  const now = Date.now();
  const period = historyMinutes * 60 * 1000;
  const startTime = now - period;
  const visibleSamples = samples.filter(sample => {
    const time = Date.parse(sample.timestamp);
    return Number.isFinite(time) && time >= startTime && time <= now + 5000;
  });
  const values = visibleSamples.flatMap(sample => visibleSeries.map(item => sample.values[item.key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value)));
  const autoMin = values.length ? Math.max(0, Math.floor(Math.min(...values) / 10) * 10 - 10) : 0;
  const autoMax = values.length ? Math.min(150, Math.max(autoMin + 20, Math.ceil(Math.max(...values) / 10) * 10 + 10)) : 100;
  const minValue = temperatureScale === "auto" ? autoMin : 0;
  const maxValue = temperatureScale === "auto" ? autoMax : Number(temperatureScale);
  const step = maxValue - minValue <= 60 ? 10 : 20;
  const ticks: number[] = [];
  for (let tick = minValue; tick < maxValue; tick += step) ticks.push(tick);
  ticks.push(maxValue);
  const plotted = visibleSeries.map(item => {
    let path = "";
    let activeSegment = false;
    const points: { x: number; y: number }[] = [];
    visibleSamples.forEach(sample => {
      const value = sample.values[item.key];
      const timestamp = Date.parse(sample.timestamp);
      if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(timestamp)) { activeSegment = false; return; }
      const x = left + Math.max(0, Math.min(1, (timestamp - startTime) / period)) * graphWidth;
      const clamped = Math.max(minValue, Math.min(maxValue, value));
      const y = top + graphHeight - ((clamped - minValue) / (maxValue - minValue)) * graphHeight;
      path += (activeSegment ? " L " : " M ") + x.toFixed(1) + " " + y.toFixed(1);
      activeSegment = true;
      points.push({ x, y });
    });
    return { ...item, path, latest: points.length ? points[points.length - 1] : null };
  });
  const hasData = plotted.some(item => item.latest !== null);
  const scaleExceeded = values.some(value => value < minValue || value > maxValue);
  const timeLabel = (timestamp: number) => new Date(timestamp).toLocaleTimeString("hu-HU", historyMinutes <= 1 ? { minute: "2-digit", second: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!visibleSeries.length || !visibleSamples.length) return;
    const svgRect = event.currentTarget.getBoundingClientRect();
    const plot = event.currentTarget.parentElement;
    if (!plot || !svgRect.width) return;
    const plotRect = plot.getBoundingClientRect();
    const pointerX = (event.clientX - svgRect.left) / svgRect.width * width;
    const clampedX = Math.max(left, Math.min(width - right, pointerX));
    const targetTime = startTime + ((clampedX - left) / graphWidth) * period;
    let nearest = visibleSamples[0];
    let nearestDistance = Math.abs(Date.parse(nearest.timestamp) - targetTime);
    for (const sample of visibleSamples) {
      const distance = Math.abs(Date.parse(sample.timestamp) - targetTime);
      if (distance < nearestDistance) { nearest = sample; nearestDistance = distance; }
    }
    const sampleTime = Date.parse(nearest.timestamp);
    const plotX = left + Math.max(0, Math.min(1, (sampleTime - startTime) / period)) * graphWidth;
    const tooltipWidth = 220;
    const tooltipHeight = Math.min(150, 40 + visibleSeries.length * 19);
    setHovered({
      timestamp: nearest.timestamp,
      left: Math.max(8, Math.min(event.clientX - plotRect.left + 12, plotRect.width - tooltipWidth - 8)),
      top: Math.max(8, Math.min(event.clientY - plotRect.top - 20, plotRect.height - tooltipHeight - 8)),
      plotX,
      values: visibleSeries.map(item => ({ key: item.key, label: item.label, color: item.color, value: nearest.values[item.key] ?? null })),
    });
  };
  return (
    <section className="performance-chart-card cooling-temperature-chart-card">
      <header className="performance-chart-header"><div><h2>Hőmérséklet-előzmények</h2><small>Az utolsó {historyMinutes} perc · másodpercenkénti minták</small></div><small>{visibleSamples.length} minta</small></header>
      {!series.length ? <div className="performance-chart-empty">Nincs elérhető hőmérséklet-szenzor.</div> : !visibleSeries.length ? <div className="performance-chart-empty">Válassz legalább egy görbét a jelmagyarázatban.</div> : !hasData ? <div className="performance-chart-empty">A kiválasztott időtávban még nincs megjeleníthető hőmérsékletadat.</div> : <>
        <div className="cooling-chart-plot">
          <svg className="performance-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Az elérhető hőmérséklet-szenzorok előzménye" onPointerMove={handlePointerMove} onPointerLeave={() => setHovered(null)}>
            {ticks.map(tick => {
              const y = top + graphHeight - ((tick - minValue) / (maxValue - minValue)) * graphHeight;
              return <g key={tick}><line x1={left} y1={y} x2={width - right} y2={y} className="performance-grid-line" /><text x={left - 7} y={y + 3} textAnchor="end" className="performance-axis-label">{tick} °C</text></g>;
            })}
            <text x={left} y={height - 5} textAnchor="start" className="performance-axis-label">{timeLabel(startTime)}</text>
            <text x={width - right} y={height - 5} textAnchor="end" className="performance-axis-label">{timeLabel(now)}</text>
            {hovered && <line x1={hovered.plotX} y1={top} x2={hovered.plotX} y2={top + graphHeight} className="cooling-crosshair" />}
            {plotted.map(item => item.path && <path key={item.key} d={item.path} fill="none" stroke={item.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />)}
            {plotted.map(item => item.latest && <circle key={item.key + "-current"} cx={item.latest.x} cy={item.latest.y} r="3.5" fill={item.color} />)}
          </svg>
          {hovered && <div className="cooling-hover-tooltip" style={{ left: hovered.left, top: hovered.top }} aria-hidden="true">
            <small>{new Date(hovered.timestamp).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small>
            {hovered.values.map(item => <div className="cooling-hover-row" key={item.key}><span><i style={{ background: item.color }} />{item.label}</span><strong>{item.value === null ? "N/A" : item.value.toFixed(1) + " °C"}</strong></div>)}
          </div>}
        </div>
        {scaleExceeded && <small className="cooling-scale-note">Néhány érték kívül esik a kiválasztott hőfokskálán.</small>}
      </>}
      <div className="cooling-chart-legend" role="group" aria-label="Hőmérsékletgörbék és színek">
        {series.map(item => {
          const isVisible = !hiddenSeries.includes(item.key);
          return <div className="cooling-series-control" key={item.key}>
            <button type="button" className={isVisible ? "cooling-series-toggle" : "cooling-series-toggle is-hidden"} aria-pressed={isVisible} aria-label={`${item.label} görbe ${isVisible ? "elrejtése" : "megjelenítése"}`} title={item.label} onClick={() => setHiddenSeries(current => current.includes(item.key) ? current.filter(key => key !== item.key) : [...current, item.key])}>
              <i style={{ "--series-color": item.color } as React.CSSProperties} /><span>{item.label}</span>
            </button>
            <label className="cooling-series-color-label"><span className="sr-only">{item.label} görbéjének színe</span><input className="cooling-series-color" type="color" value={item.color} aria-label={`${item.label} görbéjének színe`} onChange={event => onColorChange(item.key, event.target.value)} /></label>
          </div>;
        })}
      </div>
    </section>
  );
}
type PerformanceStatProps = { label: string; value: string; detail: string; color: string };
function PerformanceStat({ label, value, detail, color }: PerformanceStatProps) {
  return <article className="performance-stat-card" style={{ "--stat-accent": color } as React.CSSProperties}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

type GaugeProps = { value: number | null; unit: string; label: string; color: string; ticks?: number; decimals?: number };

function SemiGauge({ value, unit, label, color, ticks = 31, decimals = 0 }: GaugeProps) {
  const safe = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="semi-gauge" style={{ "--gauge-color": color } as React.CSSProperties}>
      <svg viewBox="0 0 260 160" aria-hidden="true">
        {Array.from({ length: ticks }, (_, i) => {
          const angle = Math.PI + (Math.PI * i) / (ticks - 1);
          const x1 = 130 + Math.cos(angle) * 91;
          const y1 = 132 + Math.sin(angle) * 91;
          const x2 = 130 + Math.cos(angle) * 108;
          const y2 = 132 + Math.sin(angle) * 108;
          const active = value !== null && i <= Math.round((safe / 100) * (ticks - 1));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={active ? "gauge-tick active" : "gauge-tick"} />;
        })}
        <path d="M 35 132 A 95 95 0 0 1 225 132" className="gauge-arc-track" />
        {value !== null && <path d="M 35 132 A 95 95 0 0 1 225 132" pathLength="100" className="gauge-arc-value" style={{ strokeDasharray: `${safe} 100` }} />}
        <ellipse cx="130" cy="145" rx="76" ry="10" className="gauge-floor-glow" />
      </svg>
      <div className="gauge-value"><strong>{value === null ? "N/A" : value.toFixed(decimals)}<small>{value === null ? "" : unit}</small></strong><span>{label}</span></div>
    </div>
  );
}

function App() {
  const [active, setActive] = useState("Áttekintés");
  const [detailSensorListExpanded, setDetailSensorListExpanded] = useState(true);
  const [theme, setTheme] = useState<Theme>(readSavedTheme);
  const [expanded, setExpanded] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceSample[]>([]);
  const [coolingHistory, setCoolingHistory] = useState<CoolingTrendSample[]>([]);
  const [coolingPreferences, setCoolingPreferences] = useState<CoolingPreferences>(readSavedCoolingPreferences);
  const [selectedStorageIndex, setSelectedStorageIndex] = useState(0);
  const [engineStatus, setEngineStatus] = useState("CONNECTING");
  const [engineError, setEngineError] = useState<string | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState<ThresholdDraft>(() => toThresholdDraft(recommendedThresholds));
  const [thresholdMessage, setThresholdMessage] = useState("");
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateBusy, setUpdateBusy] = useState(false);

  const checkForUpdates = async (silent = false) => {
    setUpdateBusy(true);
    if (!silent) setUpdateMessage("Frissítések keresése…");
    try {
      const update = await check();
      setAvailableUpdate(update);
      setUpdateMessage(update ? `Elérhető új verzió: ${update.version}` : "A NEXUS naprakész.");
    } catch {
      setUpdateMessage(silent ? "" : "A frissítés ellenőrzése most nem sikerült. Próbáld újra később.");
    } finally {
      setUpdateBusy(false);
    }
  };

  const installAvailableUpdate = async () => {
    if (!availableUpdate) return;
    setUpdateBusy(true);
    setUpdateMessage("Frissítés letöltése és telepítése…");
    try {
      await availableUpdate.downloadAndInstall();
      setUpdateMessage("A telepítő elindult; a NEXUS újraindul a frissítéshez.");
    } catch {
      setUpdateMessage("A frissítés telepítése nem sikerült. Próbáld újra később.");
      setUpdateBusy(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void checkForUpdates(true), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem("nexus-theme", theme); } catch { /* Theme persistence is optional in restricted webviews. */ }
  }, [theme]);

  useEffect(() => {
    try { window.localStorage.setItem("nexus-cooling-preferences", JSON.stringify(coolingPreferences)); } catch { /* Cooling preferences are optional in restricted webviews. */ }
  }, [coolingPreferences]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = async () => {
      try {
        const data = await invoke<Snapshot | null>("get_hardware_snapshot");
        if (active && data) { setSnapshot(data); setEngineStatus("LIVE"); setEngineError(null); }
      } catch (error) {
        if (active) { setEngineStatus("OFFLINE"); setEngineError(String(error)); }
      }
    };
    const initialize = async () => {
      try {
        const savedThresholds = await invoke<DiagnosticsThresholds>("get_diagnostic_thresholds");
        if (!active) return;
        if (isValidThresholds(savedThresholds)) setThresholdDraft(toThresholdDraft(savedThresholds));
        await invoke<string>("start_hardware_engine");
        if (!active) return;
        setEngineStatus("STARTING");
        void refresh();
        timer = setInterval(() => void refresh(), 1000);
      } catch (error) {
        if (active) { setEngineStatus("OFFLINE"); setEngineError(String(error)); }
      }
    };
    void initialize();
    return () => { active = false; if (timer) clearInterval(timer); };
  }, []);

  const parsedThresholds = parseThresholdDraft(thresholdDraft);
  const updateThreshold = (key: keyof ThresholdDraft, value: string) => {
    setThresholdDraft(current => ({ ...current, [key]: value }));
    setThresholdMessage("");
  };
  const stepThreshold = (key: keyof ThresholdDraft, change: number, min: number, max: number) => {
    const current = Number(thresholdDraft[key]);
    const base = Number.isFinite(current) ? current : min;
    updateThreshold(key, String(Math.max(min, Math.min(max, base + change))));
  };
  const applyRecommendedThresholds = () => {
    setThresholdDraft(toThresholdDraft(recommendedThresholds));
    setThresholdMessage("Az ajánlott értékek betöltve. A mentéshez nyomd meg a Mentés gombot.");
  };
  const saveThresholds = async () => {
    if (!parsedThresholds) return;
    try {
      await invoke("save_diagnostic_thresholds", { thresholds: parsedThresholds });
      setThresholdDraft(toThresholdDraft(parsedThresholds));
      setThresholdMessage("Elmentve. A Health és a Guardian a következő szenzorméréstől ezeket használja.");
    } catch (error) {
      setThresholdMessage("A mentés nem sikerült: " + String(error));
    }
  };
  const renderThresholdRow = (label: string, warningKey: keyof ThresholdDraft, criticalKey: keyof ThresholdDraft, unit: string, warningMin: number, warningMax: number, criticalMin: number, criticalMax: number) => (
    <div className="diagnostics-row settings-threshold-row" key={label}>
      <b>{label}</b>
      <span className="threshold-inputs">
        <span className="threshold-value"><label htmlFor={"threshold-" + warningKey}>Figyelmeztetés</label><span className="threshold-stepper">
          <button className="threshold-step-button" type="button" aria-label={label + " figyelmeztetési küszöb csökkentése"} title="Csökkentés 1-gyel" onClick={() => stepThreshold(warningKey, -1, warningMin, warningMax)}>−</button>
          <input id={"threshold-" + warningKey} type="number" min={warningMin} max={warningMax} step="1" value={thresholdDraft[warningKey]} onChange={event => updateThreshold(warningKey, event.target.value)} aria-label={label + " figyelmeztetési küszöb"} />
          <button className="threshold-step-button" type="button" aria-label={label + " figyelmeztetési küszöb növelése"} title="Növelés 1-gyel" onClick={() => stepThreshold(warningKey, 1, warningMin, warningMax)}>+</button>
        </span></span>
        <span className="threshold-value"><label htmlFor={"threshold-" + criticalKey}>Kritikus</label><span className="threshold-stepper">
          <button className="threshold-step-button" type="button" aria-label={label + " kritikus küszöb csökkentése"} title="Csökkentés 1-gyel" onClick={() => stepThreshold(criticalKey, -1, criticalMin, criticalMax)}>−</button>
          <input id={"threshold-" + criticalKey} type="number" min={criticalMin} max={criticalMax} step="1" value={thresholdDraft[criticalKey]} onChange={event => updateThreshold(criticalKey, event.target.value)} aria-label={label + " kritikus küszöb"} />
          <button className="threshold-step-button" type="button" aria-label={label + " kritikus küszöb növelése"} title="Növelés 1-gyel" onClick={() => stepThreshold(criticalKey, 1, criticalMin, criticalMax)}>+</button>
        </span></span>
        <em>{unit}</em>
      </span>
      <small>Figyelmeztetés / Kritikus</small>
    </div>
  );

  const metrics = useMemo(() => {
    const cpu = findDevice(snapshot, "Cpu");
    const gpu = (snapshot?.Devices ?? []).find(d => (readField<string>(d, "HardwareType", "hardwareType") ?? "").toLowerCase().includes("gpu"));
    const memory = (snapshot?.Devices ?? []).filter(d => (readField<string>(d, "HardwareType", "hardwareType") ?? "").toLowerCase() === "memory");
    const storage = (snapshot?.Devices ?? []).filter(d => {
      const t = (readField<string>(d, "HardwareType", "hardwareType") ?? "").toLowerCase();
      return t.includes("storage");
    });
    const ramDevice = memory.find(d => findSensor(d, ["memory", "physical memory", "used memory"], "Load") !== null) ?? memory[0];
    // Keep every drive visible while using the hottest valid reading for the overview gauge.
    const storageMetrics = storage.map(device => {
      const totalSpaceGiB = findSensor(device, ["Total Space"], "Data");
      const freeSpaceGiB = findSensor(device, ["Free Space"], "Data");
      return {
      name: readField<string>(device, "Name", "name") ?? "Storage",
      sensors: readField<Sensor[]>(device, "Sensors", "sensors") ?? [],
      temperature: findSensor(device, ["Composite", "Drive Temperature", "Temperature"], "Temperature"),
      totalSpaceGiB,
      freeSpaceGiB,
      usedSpaceGiB: totalSpaceGiB !== null && freeSpaceGiB !== null ? Math.max(0, totalSpaceGiB - freeSpaceGiB) : null,
      status: (readField<Sensor[]>(device, "Sensors", "sensors") ?? []).some(s => {
        const value = readField<number | null>(s, "Value", "value");
        const status = readField<string>(s, "Status", "status");
        const name = readField<string>(s, "Name", "name") ?? "";
        return typeof value === "number" && Number.isFinite(value) && status !== "Invalid" && status !== "Unavailable" && !/warning|critical|threshold/i.test(name);
      }) ? "Monitoring" : "No sensor data",
    }; });

    return {
      cpuName: cpu ? readField<string>(cpu, "Name", "name") ?? "CPU" : "CPU not detected",
      cpuTemp: findSensor(cpu, ["CPU Package", "Core (Tctl/Tdie)", "CPU Core", "Core Max"], "Temperature"),
      cpuLoad: findSensor(cpu, ["CPU Total", "Total"], "Load"),
      gpuName: gpu ? readField<string>(gpu, "Name", "name") ?? "GPU" : "GPU not detected",
      gpuTemp: findSensor(gpu, ["GPU Core", "GPU Temperature", "GPU Hot Spot"], "Temperature"),
      gpuLoad: findSensor(gpu, ["GPU Core", "GPU D3D 3D", "GPU Core Load"], "Load"),
      gpuClock: findSensor(gpu, ["GPU Core"], "Clock"),
      gpuPower: findSensor(gpu, ["GPU Power", "GPU Package", "GPU Core"], "Power"),
      gpuMemoryUsedMiB: findSensor(gpu, ["GPU Memory Used"], "SmallData"),
      gpuMemoryFreeMiB: findSensor(gpu, ["GPU Memory Free"], "SmallData"),
      gpuMemoryTotalMiB: findSensor(gpu, ["GPU Memory Total"], "SmallData"),
      ramUsedGiB: findSensor(ramDevice, ["Memory Used"], "Data"),
      ramAvailableGiB: findSensor(ramDevice, ["Memory Available"], "Data"),
      ramLoad: findSensor(ramDevice, ["Memory", "Physical Memory", "Used Memory", "Total Memory"], "Load"),
      storages: storageMetrics,
    };
  }, [snapshot]);

  const coolingTemperatureReadings = useMemo<CoolingTemperatureReading[]>(() => {
    const devices = snapshot?.Devices ?? [];
    const cpuDevice = findDevice(snapshot, "Cpu");
    const gpuDevice = devices.find(device => (readField<string>(device, "HardwareType", "hardwareType") ?? "").toLowerCase().includes("gpu"));
    const storageDevices = devices.filter(device => (readField<string>(device, "HardwareType", "hardwareType") ?? "").toLowerCase().includes("storage"));
    const hasTemperatureSensor = (device: Device | undefined) => (readField<Sensor[]>(device, "Sensors", "sensors") ?? []).some(sensor => {
      const type = (readField<string>(sensor, "SensorType", "sensorType") ?? "").toLowerCase();
      const name = readField<string>(sensor, "Name", "name") ?? "";
      return type === "temperature" && !/warning|critical|threshold/i.test(name);
    });
    const deviceKey = (device: Device | undefined, fallback: string) => readField<string>(device, "Identifier", "identifier") ?? fallback;
    const storageColors = ["#e8ad5a", "#f08b68", "#57cbb3", "#e8c15a"];
    return [
      { key: "cooling-cpu", label: "CPU", value: metrics.cpuTemp, color: "#35a7ff", warning: Number(thresholdDraft.cpuWarning) || recommendedThresholds.cpuWarning, critical: Number(thresholdDraft.cpuCritical) || recommendedThresholds.cpuCritical, hasSensor: hasTemperatureSensor(cpuDevice) },
      { key: "cooling-gpu", label: "GPU", value: metrics.gpuTemp, color: "#a98aff", warning: Number(thresholdDraft.gpuWarning) || recommendedThresholds.gpuWarning, critical: Number(thresholdDraft.gpuCritical) || recommendedThresholds.gpuCritical, hasSensor: hasTemperatureSensor(gpuDevice) },
      ...metrics.storages.map((drive, index) => ({
        key: "cooling-" + deviceKey(storageDevices[index], `${drive.name}-${index}`),
        label: drive.name,
        value: drive.temperature,
        color: storageColors[index % storageColors.length],
        warning: Number(thresholdDraft.storageWarning) || recommendedThresholds.storageWarning,
        critical: Number(thresholdDraft.storageCritical) || recommendedThresholds.storageCritical,
        hasSensor: hasTemperatureSensor(storageDevices[index]),
      })),
    ];
  }, [snapshot, metrics, thresholdDraft]);

  const coolingChartReadings = useMemo<CoolingTrendSeries[]>(() => {
    const devices = snapshot?.Devices ?? [];
    const cpuDevice = findDevice(snapshot, "Cpu");
    const gpuDevice = devices.find(device => (readField<string>(device, "HardwareType", "hardwareType") ?? "").toLowerCase().includes("gpu"));
    const storageDevices = devices.filter(device => (readField<string>(device, "HardwareType", "hardwareType") ?? "").toLowerCase().includes("storage"));
    const storageColors = ["#e8ad5a", "#ef896d", "#57cbb3", "#e8c15a", "#4eacc4", "#fb9b77"];
    const makeReading = (device: Device | undefined, sensorNames: string[], keyFallback: string, label: string, color: string): CoolingTrendSeries | null => {
      const sensor = findSensorEntry(device, sensorNames, "Temperature");
      if (!device || !sensor) return null;
      const deviceName = readField<string>(device, "Name", "name") ?? keyFallback;
      const deviceIdentifier = readField<string>(device, "Identifier", "identifier") ?? `${keyFallback}:${deviceName}`;
      const sensorName = readField<string>(sensor, "Name", "name") ?? "Temperature";
      const sensorIdentifier = readField<string>(sensor, "Identifier", "identifier") ?? sensorName;
      const key = `${deviceIdentifier}|${sensorIdentifier}`;
      const rawValue = readField<number | null>(sensor, "Value", "value");
      const value = typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue >= -20 && rawValue <= 150 ? rawValue : null;
      return { key, label: keyFallback === "storage" ? deviceName : label, color: coolingPreferences.seriesColors[key] ?? color, value };
    };
    const cpu = makeReading(cpuDevice, ["CPU Package", "Core (Tctl/Tdie)", "CPU Core", "Core Max"], "cpu", "CPU", "#35a7ff");
    const gpu = makeReading(gpuDevice, ["GPU Core", "GPU Temperature", "GPU Hot Spot"], "gpu", "GPU", "#a98aff");
    const drives = storageDevices.map((device, index) => makeReading(device, ["Composite", "Drive Temperature", "Temperature"], "storage", "Storage", storageColors[index % storageColors.length])).filter((reading): reading is CoolingTrendSeries => reading !== null);
    return [cpu, gpu, ...drives].filter((reading): reading is CoolingTrendSeries => reading !== null);
  }, [snapshot, coolingPreferences.seriesColors]);

  useEffect(() => {
    if (!snapshot?.Timestamp) return;
    const sample: PerformanceSample = {
      timestamp: snapshot.Timestamp,
      cpuLoad: metrics.cpuLoad,
      cpuTemp: metrics.cpuTemp,
      gpuLoad: metrics.gpuLoad,
      gpuTemp: metrics.gpuTemp,
      memoryLoad: metrics.ramLoad,
    };
    setPerformanceHistory(current => {
      if (current.length > 0 && current[current.length - 1].timestamp === sample.timestamp) return current;
      return [...current.slice(-59), sample];
    });
  }, [snapshot?.Timestamp, metrics]);

  useEffect(() => {
    if (!snapshot?.Timestamp) return;
    const sample: CoolingTrendSample = {
      timestamp: snapshot.Timestamp,
      values: Object.fromEntries(coolingChartReadings.map(reading => [reading.key, reading.value])),
    };
    setCoolingHistory(current => {
      if (current.length > 0 && current[current.length - 1].timestamp === sample.timestamp) return current;
      return [...current.slice(-3599), sample];
    });
  }, [snapshot?.Timestamp, coolingChartReadings]);

  const performancePeak = (key: PerformanceKey): number | null => {
    const values = performanceHistory.map(sample => sample[key]).filter((value): value is number => value !== null && Number.isFinite(value));
    return values.length > 0 ? Math.max(...values) : null;
  };

  const storageCount = metrics.storages.length;
  const activeStorageIndex = storageCount > 0 ? selectedStorageIndex % storageCount : 0;
  const selectedStorage = storageCount > 0 ? metrics.storages[activeStorageIndex] : null;
  const detailHardwareType = active === "Processzor" ? "Cpu"
    : active === "Grafikus vezérlő" ? "Gpu"
    : active === "Memória" ? "Memory"
    : null;
  const detailDevices = detailHardwareType
    ? (snapshot?.Devices ?? []).filter(device => {
      const hardwareType = (readField<string>(device, "HardwareType", "hardwareType") ?? "").toLowerCase();
      return detailHardwareType === "Gpu" ? hardwareType.includes("gpu") : hardwareType === detailHardwareType.toLowerCase();
    })
    : [];
  const cpuCoreReadings: CpuCoreReading[] = active === "Processzor" ? (() => {
    const cores = new Map<number, CpuCoreReading>();
    for (const device of detailDevices) {
      const sensors = readField<Sensor[]>(device, "Sensors", "sensors") ?? [];
      for (const sensor of sensors) {
        const name = readField<string>(sensor, "Name", "name") ?? "";
        const match = name.match(/(?:cpu\s*)?core\s*#?\s*(\d+)/i);
        if (!match) continue;
        const type = (readField<string>(sensor, "SensorType", "sensorType") ?? "").toLowerCase();
        if (type !== "load" && type !== "clock" && type !== "temperature") continue;
        const value = readField<number | null>(sensor, "Value", "value");
        const status = readField<string>(sensor, "Status", "status");
        if (typeof value !== "number" || !Number.isFinite(value) || status !== "Available") continue;
        const number = Number(match[1]);
        const core = cores.get(number) ?? { number, load: null, clock: null, temperature: null };
        if (type === "load") core.load = value;
        if (type === "clock") core.clock = value;
        if (type === "temperature") core.temperature = value;
        cores.set(number, core);
      }
    }
    return [...cores.values()].sort((left, right) => left.number - right.number);
  })() : [];
  const cpuAverageClock = (() => {
    const clocks = cpuCoreReadings.map(core => core.clock).filter((value): value is number => value !== null);
    return clocks.length ? clocks.reduce((total, value) => total + value, 0) / clocks.length : null;
  })();
  const memoryTotalGiB = metrics.ramUsedGiB !== null && metrics.ramAvailableGiB !== null
    ? metrics.ramUsedGiB + metrics.ramAvailableGiB : null;
  const memoryTotalDisplay = memoryTotalGiB !== null
    ? formatMemoryGiB(memoryTotalGiB)
    : snapshot?.WindowsInfo?.UsableMemoryGb != null ? snapshot.WindowsInfo.UsableMemoryGb.toFixed(1) + " GiB" : "N/A";
  const gpuMemoryPercent = metrics.gpuMemoryUsedMiB !== null && metrics.gpuMemoryTotalMiB !== null && metrics.gpuMemoryTotalMiB > 0
    ? Math.max(0, Math.min(100, metrics.gpuMemoryUsedMiB / metrics.gpuMemoryTotalMiB * 100)) : null;
  const coolingReadings = active === "Hűtés"
    ? (snapshot?.Devices ?? []).flatMap((device, deviceIndex) => {
      const deviceName = readField<string>(device, "Name", "name") ?? "Hardware";
      return (readField<Sensor[]>(device, "Sensors", "sensors") ?? [])
        .map((sensor, sensorIndex) => ({ deviceName, deviceIndex, sensor, sensorIndex }))
        .filter(({ sensor }) => {
          const type = (readField<string>(sensor, "SensorType", "sensorType") ?? "").toLowerCase();
          const name = readField<string>(sensor, "Name", "name") ?? "";
          return (type === "fan" || type === "temperature") && !/warning|critical|threshold/i.test(name);
        });
    })
    : [];
  const coolingDetailRows = active === "Hűtés"
    ? (snapshot?.Devices ?? []).flatMap((device, deviceIndex): CoolingDetailRow[] => {
      const deviceName = readField<string>(device, "Name", "name") ?? "Hardware";
      const rows: CoolingDetailRow[] = (readField<Sensor[]>(device, "Sensors", "sensors") ?? [])
        .map((sensor, sensorIndex) => ({ deviceName, deviceIndex, sensor, sensorIndex }))
        .filter(({ sensor }) => {
          const type = (readField<string>(sensor, "SensorType", "sensorType") ?? "").toLowerCase();
          const name = readField<string>(sensor, "Name", "name") ?? "";
          return (type === "fan" || type === "temperature") && !/warning|critical|threshold/i.test(name);
        });
      return rows.length ? rows : [{ deviceName, deviceIndex, sensor: null, sensorIndex: -1 }];
    })
    : [];
  const coolingFanReadings = coolingReadings.filter(({ sensor }) => (readField<string>(sensor, "SensorType", "sensorType") ?? "").toLowerCase() === "fan" && formatSensorValue(sensor) !== "N/A");
  const coolingChartSeries = coolingChartReadings.filter(reading => reading.value !== null || coolingHistory.some(sample => typeof sample.values[reading.key] === "number"));
  const coolingVisibleSamples = coolingHistory.filter(sample => Date.parse(sample.timestamp) >= Date.now() - coolingPreferences.historyMinutes * 60 * 1000);
  const observedCoolingTemperatures = coolingTemperatureReadings.filter(reading => reading.value !== null && Number.isFinite(reading.value));
  const coolingStatus = observedCoolingTemperatures.length === 0 ? "unknown"
    : observedCoolingTemperatures.some(reading => reading.value! >= reading.critical) ? "critical"
      : observedCoolingTemperatures.some(reading => reading.value! >= reading.warning) ? "warning" : "good";

  const fanControlChannels = (snapshot?.Devices ?? []).flatMap(device => {
    const deviceName = readField<string>(device, "Name", "name") ?? "Hardware";
    const sensors = readField<Sensor[]>(device, "Sensors", "sensors") ?? [];
    const fanSensors = sensors.filter(sensor => (readField<string>(sensor, "SensorType", "sensorType") ?? "").toLowerCase() === "fan");
    const normalizeFanName = (name: string) => name.toLowerCase().replace(/\s*control$/i, "").replace(/[^a-z0-9]/g, "");
    return sensors
      .filter(sensor => (readField<string>(sensor, "SensorType", "sensorType") ?? "").toLowerCase() === "control")
      .map(sensor => {
        const name = readField<string>(sensor, "Name", "name") ?? "Vezérlőcsatorna";
        const fanSensor = fanSensors.find(candidate => normalizeFanName(readField<string>(candidate, "Name", "name") ?? "") === normalizeFanName(name));
        const fanValue = fanSensor ? readField<number | null>(fanSensor, "Value", "value") : null;
        const fanStatus = fanSensor ? readField<string>(fanSensor, "Status", "status") : null;
        const value = readField<number | null>(sensor, "Value", "value");
        const status = readField<string>(sensor, "Status", "status");
        const minimum = readField<number | null>(sensor, "MinimumControlValue", "minimumControlValue");
        const maximum = readField<number | null>(sensor, "MaximumControlValue", "maximumControlValue");
        return {
          deviceName,
          name,
          identifier: readField<string>(sensor, "Identifier", "identifier") ?? "",
          value: typeof value === "number" && Number.isFinite(value) && status === "Available" ? value : null,
          canControl: readField<boolean>(sensor, "CanControl", "canControl") === true,
          minimum: typeof minimum === "number" && Number.isFinite(minimum) ? minimum : null,
          maximum: typeof maximum === "number" && Number.isFinite(maximum) ? maximum : null,
          mode: readField<string>(sensor, "ControlMode", "controlMode") ?? "N/A",
          hasFanSensor: fanSensor !== undefined,
          fanRpm: typeof fanValue === "number" && Number.isFinite(fanValue) && fanStatus === "Available" ? fanValue : null,
        };
      });
  });
  const fanRpmReadings = (snapshot?.Devices ?? []).flatMap(device => {
    const deviceName = readField<string>(device, "Name", "name") ?? "Hardware";
    return (readField<Sensor[]>(device, "Sensors", "sensors") ?? [])
      .filter(sensor => (readField<string>(sensor, "SensorType", "sensorType") ?? "").toLowerCase() === "fan")
      .map((sensor, index) => ({
        key: deviceName + ":" + index,
        deviceName,
        name: readField<string>(sensor, "Name", "name") ?? "Fan",
        value: readField<number | null>(sensor, "Value", "value"),
        status: readField<string>(sensor, "Status", "status"),
      }));
  });
  const isOverview = active === "Áttekintés";

  return (
    <main className={`nexus-app theme-${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div><b>NEXUS</b><small>HARDWARE INTELLIGENCE</small></div>
        </div>
        <div className="sidebar-scroll">
          {navigation.map((section) => (
            <div className="nav-section" key={section.group}>
              <div className="nav-label">{section.group}</div>
              {section.items.map(([name, icon]) => (
                <button key={name} className={`nav-item ${active === name ? "active" : ""}`} onClick={() => setActive(name)}>
                  <span className="nav-icon">{icon}</span><span>{name}</span>
                  {name === "Guardian" && (snapshot?.GuardianEvents ?? []).filter(event => event.IsActive).length > 0 && <i className="nav-alert">{(snapshot?.GuardianEvents ?? []).filter(event => event.IsActive).length}</i>}
                </button>
              ))}
            </div>
          ))}
          <div className="nav-section">
            <button className="nav-label nav-label-button" onClick={() => setExpanded(!expanded)}>RENDSZER <span>{expanded ? "⌄" : "›"}</span></button>
            {expanded && <>
              <button className={`nav-item ${active === "Rendszer és Windows" ? "active" : ""}`} onClick={() => setActive("Rendszer és Windows")}><span className="nav-icon">⌘</span>Rendszer és Windows</button>
              <button className={`nav-item ${active === "Beállítások" ? "active" : ""}`} onClick={() => setActive("Beállítások")}><span className="nav-icon">⚙</span>Beállítások</button>
            </>}
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="engine-status"><span className="status-dot" /><div><b>NEXUS CORE</b><small>{engineStatus === "LIVE" ? "Valós szenzoradatok" : engineStatus === "OFFLINE" ? "Kapcsolat megszakadt" : "Motor indítása"}</small></div><em>{engineStatus}</em></div>
          <div className="version">NEXUS · BUILD 0.2.0</div>
        </div>
      </aside>

      <section className="main-area">
        <header className="titlebar">
          <div className="breadcrumb" data-tauri-drag-region><span>NEXUS</span><i>/</i><b>{active}</b></div>
          <div className="titlebar-actions">
            <span className="data-mode"><i /> {engineStatus === "LIVE" ? "LIVE HARDWARE DATA" : engineStatus === "OFFLINE" ? "ENGINE OFFLINE" : "CONNECTING"}</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)} aria-label="Téma">
              {themes.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <div className="user-chip">NX</div>
            <WindowControls />
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div><div className="eyebrow"><i /> {isOverview ? "SYSTEM OVERVIEW" : "LIVE HARDWARE DATA"}</div><h1>{isOverview ? "Welcome back!" : active}</h1><p>{isOverview ? "Így teljesít jelenleg a számítógéped." : active === "Ventilátorvezérlés" ? "Beépített ventilátorcsatornák és hardveres vezérlés." : "Részletes rendszerfelügyelet és hardverdiagnosztika."}</p></div>
            <div className="heading-actions"><button onClick={() => setActive("Beállítások")}>Beállítások <span>›</span></button><button onClick={() => setActive("Rendszer és Windows")}>Saját PC <span>›</span></button></div>
          </div>

          {active === "Ventilátorvezérlés" && <div className="fan-control-native-view">
            <section className="diagnostics-panel">
              <div className="fan-control-native-heading"><div><h2>NEXUS · Ventilátorvezérlés</h2><p>A NEXUS közvetlenül a hardver-backendet használja. Először zárd be a Fan Controlt és más ventilátorvezérlő programot.</p></div><span>{fanControlChannels.filter(channel => channel.canControl).length} írható csatorna</span></div>
              {fanControlChannels.length === 0 ? <p>Nincs felismert ventilátorvezérlő-kimenet. A fordulatszám-érzékelők ettől még külön megjelenhetnek.</p> : <div className="fan-control-native-grid">{fanControlChannels.map((channel, index) => <NativeFanControlChannel channel={channel} key={channel.identifier || channel.deviceName + index} />)}</div>}
            </section>
            <section className="diagnostics-panel">
              <h2>Ventilátorfordulatszámok</h2>
              {fanRpmReadings.length === 0 ? <p>Nincs elérhető fordulatszám-szenzor.</p> : fanRpmReadings.map(reading => <div className="diagnostics-row fan-control-native-row" key={reading.key}>
                <b>{reading.name}</b><span>{reading.status === "Available" ? display(reading.value ?? null, " RPM", 1) : "N/A"}</span><small>{reading.deviceName}</small>
              </div>)}
            </section>
            <section className="diagnostics-panel">
              <h2>Állapot</h2><p>A NEXUS most csak felismeri az írható csatornákat. A következő lépés a görbe- és kézi vezérlés lesz külön bekapcsolóval, hogy a program ne módosítsa a ventilátorokat felhasználói kérés nélkül.</p>
            </section>
          </div>}
          {isOverview && <>
          <div className="overview-layout">
            <aside className="health-column">
              <div className="health-card" title={snapshot?.Health?.Reasons.join("\n")}>
                <div className="health-title"> <span>♡</span> Health</div>
                <div className={`health-good health-${snapshot?.Health?.Status ?? "pending"}`}><i /> {snapshot?.Health?.Score == null ? "Insufficient data" : snapshot.Health.Status}</div>
                <div className="health-meter"><div className="health-fill" style={{ height: `${snapshot?.Health?.Score ?? 0}%` }} /><div className="health-scale"><b>100%</b>{Array.from({length:15},(_,i)=><i key={i}/>)}</div></div>
                <div className="health-bottom"><b>{snapshot?.Health?.Score ?? "—"}</b><small>{snapshot?.Health?.CoveragePercent ?? 0}% DATA<br/>COVERAGE</small></div>
              </div>
            </aside>

            <section className="hardware-grid">
              <article className="hardware-card cpu-card">
                <div className="card-icon">▦</div><div className="card-copy"><span>PROCESSOR</span><h2>CPU</h2><p>{metrics.cpuName}</p><button onClick={() => setActive("Processzor")}>Részletek <b>›</b></button></div>
                <SemiGauge value={metrics.cpuTemp} unit="°C" decimals={1} label={metrics.cpuTemp === null ? "Unavailable" : `Load ${display(metrics.cpuLoad, "%")}`} color="var(--accent)" />
                <div className="card-corner">01 / CPU</div>
              </article>
              <article className="hardware-card gpu-card">
                <div className="card-icon">▧</div><div className="card-copy"><span>GRAPHICS</span><h2>GPU</h2><p>{metrics.gpuName}</p><button onClick={() => setActive("Grafikus vezérlő")}>Részletek <b>›</b></button></div>
                <SemiGauge value={metrics.gpuTemp} unit="°C" decimals={1} label={metrics.gpuTemp === null ? "Unavailable" : `Load ${display(metrics.gpuLoad, "%")}`} color="#a98aff" />
                <div className="card-corner">02 / GPU</div>
              </article>
              <article className="hardware-card ram-card">
                <div className="card-icon">▤</div><div className="card-copy"><span>MEMORY</span><h2>RAM</h2><p>{metrics.ramLoad === null ? "Memory usage unavailable" : `Memory load · ${display(metrics.ramLoad, "%")}`}</p><button onClick={() => setActive("Memória")}>Részletek <b>›</b></button></div>
                <SemiGauge value={metrics.ramLoad} unit="%" label={metrics.ramLoad === null ? "Unavailable" : "Utilization"} color="#36c9b1" />
                <div className="card-corner">03 / RAM</div>
              </article>
              <article className="hardware-card storage-card">
                <div className="card-icon">▣</div><div className="card-copy"><span>STORAGE</span><h2>{storageCount} drive{storageCount === 1 ? "" : "s"}</h2><p>{selectedStorage?.name ?? "No storage detected"}</p><button onClick={() => setActive("Háttértárak")}>Részletek <b>›</b></button>
                  {storageCount > 0 && <div className="storage-pager" aria-label="Storage drive selection">
                    <button type="button" aria-label="Previous drive" title="Previous drive" disabled={storageCount < 2} onClick={() => setSelectedStorageIndex((activeStorageIndex + storageCount - 1) % storageCount)}>‹</button>
                    <span aria-live="polite">{activeStorageIndex + 1} / {storageCount}</span>
                    <button type="button" aria-label="Next drive" title="Next drive" disabled={storageCount < 2} onClick={() => setSelectedStorageIndex((activeStorageIndex + 1) % storageCount)}>›</button>
                  </div>}
                </div>
                <SemiGauge value={selectedStorage?.temperature ?? null} unit="°C" decimals={1} label={selectedStorage ? selectedStorage.temperature === null ? "No temperature data" : "Drive temperature" : "No temperature data"} color="#e8ad5a" />
                <div className="card-corner">04 / SSD</div>
              </article>
            </section>
          </div>

          <section className="quick-access">
            <button className="quick-card" onClick={() => setActive("Teljesítmény")}><span className="quick-icon">▥</span><span><b>Game Analysis</b><small>Játék közbeni teljesítmény és FPS</small></span><i>›</i></button>
            <button className="quick-card" onClick={() => setActive("Hűtés")}><span className="quick-icon">✣</span><span><b>Optimize my PC</b><small>Hűtés és rendszerállapot kezelése</small></span><i>›</i></button>
            <button className="quick-card" onClick={() => setActive("Guardian")}><span className="quick-icon">⬡</span><span><b>NEXUS Guardian</b><small>Hibák és figyelmeztetések</small></span><i>›</i></button>
          </section>
          </>}
          {active === "Beállítások" && <section className="diagnostics-panel"><h2>Beállítások</h2>
            <div className="diagnostics-row settings-updater-row"><b>Programfrissítés</b><span>{updateMessage || "Indításkor automatikusan keres új verziót."}</span><div className="settings-updater-actions"><button className="settings-secondary-button" type="button" disabled={updateBusy} onClick={() => void checkForUpdates()}>{updateBusy ? "Ellenőrzés…" : "Frissítések keresése"}</button>{availableUpdate && <button className="settings-save-button" type="button" disabled={updateBusy} onClick={() => void installAvailableUpdate()}>Frissítés telepítése</button>}</div></div>
            <div className="diagnostics-row"><b>Megjelenési téma</b>
              <span><select className="settings-theme-select" value={theme} onChange={event => setTheme(event.target.value as Theme)} aria-label="Megjelenési téma">
                {themes.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select></span>
              <small>A választás automatikusan mentésre kerül ezen a gépen.</small>
            </div>
            <div className="diagnostics-row settings-recommendation-row"><b>Javasolt beállítás</b><span className="settings-recommended-values">CPU / GPU 85 / 95 °C · memória 90 / 97% · tárhely 70 / 80 °C</span><button className="settings-secondary-button" type="button" onClick={applyRecommendedThresholds}>Ajánlott betöltése</button></div>
            {renderThresholdRow("CPU riasztási küszöb", "cpuWarning", "cpuCritical", "°C", 40, 110, 41, 120)}
            {renderThresholdRow("GPU riasztási küszöb", "gpuWarning", "gpuCritical", "°C", 40, 110, 41, 120)}
            {renderThresholdRow("Memória-terhelési küszöb", "memoryWarning", "memoryCritical", "%", 50, 99, 51, 100)}
            {renderThresholdRow("Tárhely-hőmérsékleti küszöb", "storageWarning", "storageCritical", "°C", 30, 100, 31, 120)}
            <div className="settings-actions"><small>{thresholdMessage || (parsedThresholds ? "Állítsd be a saját értékeidet, majd mentsd el." : "A kritikus küszöbnek magasabbnak kell lennie a figyelmeztetőnél.")}</small><button className="settings-save-button" type="button" disabled={!parsedThresholds} onClick={() => void saveThresholds()}>Mentés</button></div>
          </section>}
          {active === "Rendszer és Windows" && <section className="diagnostics-panel system-info-panel"><h2>Alapvető rendszerinformációk</h2>
            <div className="system-section-label">Windows-verzió</div>
            <div className="diagnostics-row"><b>Kiadás</b><span>{snapshot?.WindowsInfo?.WindowsEdition ?? "N/A"}</span><small>{snapshot?.WindowsInfo?.WindowsVersion ?? snapshot?.OperatingSystem ?? "N/A"}</small></div>
            <div className="diagnostics-row"><b>Windows aktiválása</b><span>{snapshot?.WindowsInfo?.IsActivated == null ? "N/A" : snapshot.WindowsInfo.IsActivated ? "Aktiválva" : "Nincs aktiválva"}</span><small>Windows licencállapot</small></div>
            <div className="system-section-label">Rendszer</div>
            <div className="diagnostics-row"><b>Gyártó</b><span>{snapshot?.WindowsInfo?.Manufacturer ?? "N/A"}</span><small>BIOS rendszeradat</small></div>
            <div className="diagnostics-row"><b>Típus</b><span>{snapshot?.WindowsInfo?.Model ?? "N/A"}</span><small>BIOS rendszeradat</small></div>
            <div className="diagnostics-row"><b>Processzor</b><span>{metrics.cpuName}</span><small>{snapshot?.LogicalProcessorCount ?? "N/A"} logikai processzor</small></div>
            <div className="diagnostics-row"><b>Memória (RAM)</b><span>{snapshot?.WindowsInfo?.UsableMemoryGb == null ? "N/A" : `${snapshot.WindowsInfo.UsableMemoryGb.toFixed(1)} GB`}</span><small>A Windows számára használható fizikai memória</small></div>
            <div className="diagnostics-row"><b>Rendszer típusa</b><span>{snapshot?.WindowsInfo?.SystemType ?? "N/A"}</span><small>Operációs rendszer és processzorarchitektúra</small></div>
            <div className="diagnostics-row"><b>Számítógép neve</b><span>{snapshot?.ComputerName ?? "N/A"}</span><small>Helyi gépnév</small></div>
          </section>}
          {active === "Teljesítmény" && <div className="performance-view">
            <section className="performance-summary-grid" aria-label="Élő teljesítménymutatók">
              <PerformanceStat label="CPU terhelés" value={display(metrics.cpuLoad, "%")} detail={metrics.cpuName + " · " + display(metrics.cpuTemp, " °C", 1) + " · csúcs " + display(performancePeak("cpuLoad"), "%")} color="#35a7ff" />
              <PerformanceStat label="GPU terhelés" value={display(metrics.gpuLoad, "%")} detail={metrics.gpuName + " · " + display(metrics.gpuTemp, " °C", 1) + " · csúcs " + display(performancePeak("gpuLoad"), "%")} color="#a98aff" />
              <PerformanceStat label="Memória-terhelés" value={display(metrics.ramLoad, "%")} detail={"Utolsó 60 minta csúcsa: " + display(performancePeak("memoryLoad"), "%")} color="#36c9b1" />
            </section>
            <div className="performance-charts-grid">
              <PerformanceChart title="Rendszerterhelés" unit="%" samples={performanceHistory} series={[
                { key: "cpuLoad", label: "CPU", color: "#35a7ff" },
                { key: "gpuLoad", label: "GPU", color: "#a98aff" },
                { key: "memoryLoad", label: "Memória", color: "#36c9b1" },
              ]} />
              <PerformanceChart title="Hőmérsékletek" unit=" °C" maxValue={110} samples={performanceHistory} series={[
                { key: "cpuTemp", label: "CPU", color: "#35a7ff" },
                { key: "gpuTemp", label: "GPU", color: "#a98aff" },
              ]} />
            </div>
            <section className="performance-fps-panel"><div><h2>Játék FPS</h2><small>Játék közbeni képkockaadatot a jelenlegi hardveres adatforrás nem szolgáltat.</small></div><strong>N/A</strong></section>
          </div>}
          {active === "Hűtés" && <div className="cooling-view">
            <section className="cooling-summary-panel">
              <div className={`cooling-status-banner cooling-status-${coolingStatus}`} role="status">
                <span>HŰTÉSI ÁLLAPOT</span>
                <strong>{coolingStatus === "critical" ? "Kritikus" : coolingStatus === "warning" ? "Figyelmeztetés" : coolingStatus === "good" ? "Normál" : "N/A"}</strong>
                <small>{coolingStatus === "unknown" ? "Nincs használható hőmérsékletadat." : "CPU, GPU és háttértárak mért hőfokai alapján."}</small>
              </div>
              <div className="cooling-temperature-grid">
                {coolingTemperatureReadings.map(reading => {
                  const level = reading.value === null ? "unknown" : reading.value >= reading.critical ? "critical" : reading.value >= reading.warning ? "warning" : "good";
                  return <article className={`cooling-temperature-card cooling-temperature-${level}`} key={reading.key} style={{ "--cooling-color": reading.color } as React.CSSProperties}>
                    <span>{reading.label}</span>
                    <strong>{display(reading.value, " °C", 1)}</strong>
                    <small>{reading.value === null ? "Nincs elérhető hőfokadat" : `Figyelmeztetés ${reading.warning} °C · Kritikus ${reading.critical} °C`}</small>
                  </article>;
                })}
              </div>
            </section>
            <section className="cooling-chart-panel">
              <div className="cooling-chart-controls">
                <div><h2>Hőmérséklet-előzmények</h2><small>CPU, GPU és minden felismert meghajtó hőfoka</small></div>
                <label className="cooling-select-control"><span>Időtáv</span><select value={coolingPreferences.historyMinutes} onChange={event => setCoolingPreferences(current => ({ ...current, historyMinutes: Number(event.target.value) as CoolingTimeRange }))} aria-label="Hőmérsékletgrafikon időtávja">
                  {coolingTimeRanges.map(minutes => <option key={minutes} value={minutes}>{minutes} perc</option>)}
                </select></label>
                <label className="cooling-select-control"><span>Hőfokskála</span><select value={coolingPreferences.temperatureScale} onChange={event => setCoolingPreferences(current => ({ ...current, temperatureScale: event.target.value as CoolingTemperatureScale }))} aria-label="Hőmérsékletgrafikon skálája">
                  <option value="auto">Automatikus</option><option value="60">0–60 °C</option><option value="80">0–80 °C</option><option value="100">0–100 °C</option><option value="120">0–120 °C</option>
                </select></label>
              </div>
              <CoolingTemperatureChart samples={coolingVisibleSamples} series={coolingChartSeries} historyMinutes={coolingPreferences.historyMinutes} temperatureScale={coolingPreferences.temperatureScale} onColorChange={(key, color) => setCoolingPreferences(current => ({ ...current, seriesColors: { ...current.seriesColors, [key]: color } }))} />
            </section>
            <section className="cooling-fan-panel">
              <header><div><h2>Ventilátorok</h2><small>Aktuális fordulatszám · grafikon nélkül</small></div></header>
              {coolingFanReadings.length === 0 ? <p>Nincs elérhető ventilátor-fordulatszámadat.</p> : <div className="cooling-fan-grid">{coolingFanReadings.map(({ deviceName, deviceIndex, sensor, sensorIndex }) => <article className="cooling-fan-reading" key={`${deviceIndex}-${sensorIndex}`}>
                <div className="cooling-fan-copy"><span>{readField<string>(sensor, "Name", "name") ?? "Ventilátor"}</span><small>{deviceName}</small></div><strong className="cooling-fan-rpm">{formatSensorValue(sensor)}</strong>
              </article>)}</div>}
            </section>
            <section className="diagnostics-panel cooling-details-panel">
              <div className="cooling-details-header"><h2>Részletes szenzorlista</h2><label><input type="checkbox" checked={coolingPreferences.showSensorDetails} onChange={event => setCoolingPreferences(current => ({ ...current, showSensorDetails: event.target.checked }))} /> Lista megjelenítése</label></div>
              {coolingPreferences.showSensorDetails && (coolingDetailRows.length === 0 ? <p>Nincs felismert hardvereszköz.</p> : coolingDetailRows.map(({ deviceName, deviceIndex, sensor, sensorIndex }) => <div className="diagnostics-row" key={`${deviceIndex}-${sensorIndex}`}>
                <b>{deviceName} · {sensor ? readField<string>(sensor, "Name", "name") ?? "Sensor" : "Hőmérséklet / ventilátor"}</b>
                <span>{sensor ? formatSensorValue(sensor) : "N/A"}</span>
                <small>{sensor ? `${readField<string>(sensor, "SensorType", "sensorType") ?? "Sensor"} · ${readField<string>(sensor, "Status", "status") ?? "Unavailable"}` : "Nincs ilyen szenzoradat"}</small>
              </div>))}
            </section>
          </div>}
          {active === "Processzor" && <>
            <section className="diagnostics-panel cpu-detail-panel">
              <h2>{metrics.cpuName} · Áttekintés</h2>
              <div className="cpu-detail-summary-grid">
                <div className="cpu-detail-stat"><span>Összterhelés</span><strong>{display(metrics.cpuLoad, "%")}</strong><small>Logikai processzorok összesen</small></div>
                <div className="cpu-detail-stat"><span>Hőmérséklet</span><strong>{display(metrics.cpuTemp, " °C", 1)}</strong><small>Elérhető CPU hőmérséklet-szenzor</small></div>
                <div className="cpu-detail-stat"><span>Magok átlagos órajele</span><strong>{display(cpuAverageClock, " MHz", 0)}</strong><small>{cpuCoreReadings.filter(core => core.clock !== null).length} magból mérve</small></div>
                <div className="cpu-detail-stat"><span>Logikai processzorok</span><strong>{snapshot?.LogicalProcessorCount ?? "N/A"}</strong><small>A Windows által jelentett szám</small></div>
              </div>
            </section>
            <section className="diagnostics-panel cpu-detail-panel">
              <div className="cpu-detail-heading"><h2>Magonkénti adatok</h2><small>{cpuCoreReadings.length} felismert mag</small></div>
              {cpuCoreReadings.length === 0
                ? <p>A hardveres adatforrás nem szolgáltat külön magonkénti terhelés-, órajel- vagy hőmérsékletadatot.</p>
                : <div className="cpu-core-grid">{cpuCoreReadings.map(core =>
                  <article className="cpu-core-card" key={"cpu-core-" + core.number}>
                    <div className="cpu-core-card-heading"><b>Mag {core.number}</b><span>{display(core.load, "%")}</span></div>
                    <div className="cpu-core-load-track"><i style={{ width: core.load === null ? "0%" : Math.max(0, Math.min(100, core.load)) + "%" }} /></div>
                    <div className="cpu-core-metrics">
                      <div><small>Órajel</small><strong>{display(core.clock, " MHz", 0)}</strong></div>
                      <div><small>Hőmérséklet</small><strong>{display(core.temperature, " °C", 1)}</strong></div>
                    </div>
                  </article>)}</div>}
            </section>
          </>}
          {active === "Grafikus vezérlő" && <>
            <section className="diagnostics-panel device-detail-panel">
              <h2>{metrics.gpuName} · Áttekintés</h2>
              <div className="cpu-detail-summary-grid">
                <div className="cpu-detail-stat"><span>GPU-terhelés</span><strong>{display(metrics.gpuLoad, "%")}</strong><small>Élő terhelésadat</small></div>
                <div className="cpu-detail-stat"><span>Hőmérséklet</span><strong>{display(metrics.gpuTemp, " °C", 1)}</strong><small>Elérhető GPU hőmérséklet-szenzor</small></div>
                <div className="cpu-detail-stat"><span>Magórajel</span><strong>{display(metrics.gpuClock, " MHz", 0)}</strong><small>GPU Core</small></div>
                <div className="cpu-detail-stat"><span>Teljesítmény</span><strong>{display(metrics.gpuPower, " W", 1)}</strong><small>Ha a GPU szolgáltat ilyen adatot</small></div>
              </div>
            </section>
            <section className="diagnostics-panel device-detail-panel">
              <div className="cpu-detail-heading"><h2>Videomemória · VRAM</h2><small>{gpuMemoryPercent === null ? "Nincs VRAM-kihasználtsági adat" : display(gpuMemoryPercent, "%", 1)}</small></div>
              {gpuMemoryPercent !== null && <div className="device-memory-track"><i style={{ width: gpuMemoryPercent + "%" }} /></div>}
              <div className="device-memory-values">
                <div><small>Használt</small><strong>{formatMemoryMiBAsGiB(metrics.gpuMemoryUsedMiB)}</strong></div>
                <div><small>Szabad</small><strong>{formatMemoryMiBAsGiB(metrics.gpuMemoryFreeMiB)}</strong></div>
                <div><small>Összesen</small><strong>{formatMemoryMiBAsGiB(metrics.gpuMemoryTotalMiB)}</strong></div>
              </div>
            </section>
          </>}
          {active === "Memória" && <>
            <section className="diagnostics-panel device-detail-panel">
              <h2>Rendszermemória · Áttekintés</h2>
              <div className="cpu-detail-summary-grid">
                <div className="cpu-detail-stat"><span>Használt memória</span><strong>{formatMemoryGiB(metrics.ramUsedGiB)}</strong><small>Mért fizikai memóriahasználat</small></div>
                <div className="cpu-detail-stat"><span>Szabad memória</span><strong>{formatMemoryGiB(metrics.ramAvailableGiB)}</strong><small>Mért, jelenleg elérhető memória</small></div>
                <div className="cpu-detail-stat"><span>Összesen</span><strong>{memoryTotalDisplay}</strong><small>Fizikai memória</small></div>
                <div className="cpu-detail-stat"><span>Terhelés</span><strong>{display(metrics.ramLoad, "%")}</strong><small>Rendszermemória használata</small></div>
              </div>
              {metrics.ramLoad !== null && <div className="device-memory-track"><i className="memory-fill" style={{ width: Math.max(0, Math.min(100, metrics.ramLoad)) + "%" }} /></div>}
            </section>
          </>}
          {detailHardwareType && <section className="diagnostics-panel">
            <div className="detail-sensors-heading">
              <h2>{active === "Processzor" ? "Processzor · Összes élő szenzor" : active + " · Élő szenzorok"}</h2>
              {detailHardwareType !== null && <button className="detail-sensors-toggle" type="button" aria-expanded={detailSensorListExpanded} aria-controls="hardware-live-sensors" onClick={() => setDetailSensorListExpanded(value => !value)}>
                {detailSensorListExpanded ? "Összecsukás" : "Kibontás"} <span>{detailSensorListExpanded ? "⌃" : "⌄"}</span>
              </button>}
            </div>
            {detailSensorListExpanded && <div id="hardware-live-sensors">
              {detailDevices.length === 0 ? <p>Nincs felismert eszköz.</p> : detailDevices.flatMap((device, deviceIndex) => {
                const deviceName = readField<string>(device, "Name", "name") ?? active;
                const sensors = readField<Sensor[]>(device, "Sensors", "sensors") ?? [];
                if (sensors.length === 0) return [<div className="diagnostics-row" key={deviceIndex + "-empty"}><b>{deviceName}</b><span>N/A</span><small>Nincs szenzoradat</small></div>];
                return sensors.map((sensor, sensorIndex) => <div className="diagnostics-row" key={deviceIndex + "-" + sensorIndex}>
                  <b>{deviceName} · {translateSensorName(readField<string>(sensor, "Name", "name") ?? "Szenzor")}</b>
                  <span>{formatSensorValue(sensor)}</span>
                  <small>{translateSensorType(readField<string>(sensor, "SensorType", "sensorType"))} · {translateSensorStatus(readField<string>(sensor, "Status", "status"))}</small>
                </div>);
              })}
            </div>}
          </section>}
          {active === "Háttértárak" && <div className="storage-detail-view">
            <section className="diagnostics-panel storage-detail-panel">
              <div className="cpu-detail-heading"><div><h2>Felismert háttértárak</h2><small>{metrics.storages.length} meghajtó · külön szenzoradatok</small></div><span>{metrics.storages.filter(drive => drive.status === "Monitoring").length} figyelt</span></div>
              {metrics.storages.length === 0 ? <p>Nincs felismert háttértár.</p> : <div className="storage-device-grid">{metrics.storages.map((drive, index) => {
                const visibleSensors = drive.sensors.filter(sensor => {
                  const type = (readField<string>(sensor, "SensorType", "sensorType") ?? "").toLowerCase();
                  const value = readField<number | null>(sensor, "Value", "value");
                  return typeof value === "number" && Number.isFinite(value) && readField<string>(sensor, "Status", "status") === "Available" &&
                    ["temperature", "load", "level", "power", "fan", "voltage", "data"].includes(type);
                });
                return <article className="storage-device-card" key={drive.name + "-" + index}>
                  <div className="storage-device-heading"><h3>{drive.name}</h3><span className={drive.status === "Monitoring" ? "storage-live-status" : "storage-empty-status"}>{drive.status === "Monitoring" ? "ÉLŐ ADAT" : "NINCS ADAT"}</span></div>
                  <div className="storage-device-temperature"><small>Hőmérséklet</small><strong>{display(drive.temperature, " °C", 1)}</strong></div>
                  <div className="storage-space-values">
                    <div><small>Teljes kapacitás</small><strong>{formatMemoryGiB(drive.totalSpaceGiB)}</strong></div>
                    <div><small>Foglalt hely</small><strong>{formatMemoryGiB(drive.usedSpaceGiB)}</strong></div>
                    <div><small>Szabad hely</small><strong>{formatMemoryGiB(drive.freeSpaceGiB)}</strong></div>
                  </div>
                  <details className="storage-sensor-details">
                    <summary>Részletes szenzorok · {visibleSensors.length}</summary>
                    {visibleSensors.length === 0 ? <p>Nincs elérhető részletes szenzoradat.</p> : visibleSensors.map((sensor, sensorIndex) =>
                      <div className="diagnostics-row" key={drive.name + "-sensor-" + sensorIndex}>
                        <b>{translateSensorName(readField<string>(sensor, "Name", "name") ?? "Szenzor")}</b>
                        <span>{formatSensorValue(sensor)}</span>
                        <small>{translateSensorType(readField<string>(sensor, "SensorType", "sensorType"))}</small>
                      </div>)}
                  </details>
                </article>;
              })}</div>}
            </section>
          </div>}          {active === "Guardian" && <section className="diagnostics-panel"><h2>Guardian · Szenzoresemények</h2>{(snapshot?.GuardianEvents ?? []).length === 0 ? <p>Nincs aktív vagy friss riasztás.</p> : snapshot?.GuardianEvents?.map(event => <div className={`diagnostics-row alert-${event.Severity.toLowerCase()}`} key={event.Id}><b>{event.Device} · {event.Sensor}</b><span>{event.Severity}</span><small>{event.Message} · {event.IsActive ? "Aktív" : "Lezárva"}</small></div>)}</section>}
          <footer className="content-footer"><span>NEXUS HARDWARE INTELLIGENCE</span><span><i /> {snapshot ? `LAST UPDATE · ${snapshot.Timestamp ?? "LIVE"}` : (engineError ? `ENGINE ERROR · ${engineError}` : "WAITING FOR HARDWARE DATA")}</span></footer>
        </div>
      </section>
    </main>
  );
}

export default App;
