import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./App.css";
import nexusWordmark from "./assets/nexus-wordmark.svg";

import WindowControls from "./WindowControls";

type ModuleIconName = "overview" | "cpu" | "gpu" | "memory" | "storage" | "cooling" | "performance" | "guardian" | "system" | "settings" | "temperature" | "load" | "capacity";
const navigation: { group: string; items: [string, ModuleIconName][] }[] = [
  { group: "FŐMENÜ", items: [["Áttekintés", "overview"], ["Processzor", "cpu"], ["Grafikus vezérlő", "gpu"], ["Memória", "memory"], ["Háttértárak", "storage"]] },
  { group: "ESZKÖZÖK", items: [["Hűtés", "cooling"], ["Teljesítmény", "performance"], ["Guardian", "guardian"]] },
];
const themes = [
  { value: "blue", label: "KÉK", color: "#378fff" },
  { value: "purple", label: "LILA", color: "#b18aff" },
  { value: "green", label: "ZÖLD", color: "#42dda5" },
  { value: "red", label: "PIROS", color: "#ff637b" },
  { value: "rose", label: "RÓZSAÉJ", color: "#ff708d" },
  { value: "aurora", label: "AURORA NOCTURNE", color: "#25e1cb" },
  { value: "ice", label: "JÉGKÉK", color: "#82d9ff" },
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

function ModuleIcon({ name, className = "" }: { name: ModuleIconName; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "overview" && <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-7h6v7"/></>}
    {name === "cpu" && <><rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/><path d="M9 9h6v6H9z" opacity=".55"/></>}
    {name === "gpu" && <><rect x="2.5" y="5.5" width="19" height="12.5" rx="1.7"/><circle cx="8.5" cy="11.7" r="3.1"/><circle cx="16" cy="11.7" r="3.1"/><circle cx="8.5" cy="11.7" r=".7" fill="currentColor"/><circle cx="16" cy="11.7" r=".7" fill="currentColor"/><path d="M8.5 9.4v4.6m-2.3-2.3h4.6M16 9.4V14m-2.3-2.3h4.6M5 20v-2m14 2v-2"/></>}
    {name === "memory" && <><rect x="2.5" y="7" width="19" height="10" rx="1.7"/><path d="M5.5 10h13v4h-13zM5 18v2m3-2v2m3-2v2m3-2v2m3-2v2m3-2v2"/><path d="M7 11.2h1m2 0h1m2 0h1m2 0h1"/></>}
    {name === "storage" && <><rect x="3.5" y="3" width="17" height="18" rx="3"/><path d="M6.5 7.5h11m-11 4.5h11m-11 4.5h11"/><circle cx="17.5" cy="18.5" r=".7" fill="currentColor"/></>}
    {name === "cooling" && <><circle cx="12" cy="12" r="2"/><path d="M12 10c-1-3-1-6 1-7 2-1 4 1 3 3-1 2-2 3-4 4Zm2 2c3-1 6-1 7 1 1 2-1 4-3 3-2-1-3-2-4-4Zm-2 2c1 3 1 6-1 7-2 1-4-1-3-3 1-2 2-3 4-4Zm-2-2c-3 1-6 1-7-1-1-2 1-4 3-3 2 1 3 2 4 4Z"/></>}
    {name === "performance" && <><path d="M4 19V12m5 7V7m6 12V10m5 9V4"/><path d="M2 21h20"/></>}
    {name === "guardian" && <><path d="M12 3 20 6v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.3 2.3 4.8-5"/></>}
    {name === "system" && <><rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="7" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><rect x="13" y="13" width="8" height="7" rx="1"/></>}
    {name === "settings" && <><path d="M10.3 2.8h3.4l.6 2.1a7.3 7.3 0 0 1 1.5.9l2.1-.7 1.7 2.9-1.5 1.6a7.7 7.7 0 0 1 0 1.8l1.5 1.6-1.7 2.9-2.1-.7a7.3 7.3 0 0 1-1.5.9l-.6 2.1h-3.4l-.6-2.1a7.3 7.3 0 0 1-1.5-.9l-2.1.7-1.7-2.9 1.5-1.6a7.7 7.7 0 0 1 0-1.8L4.8 8l1.7-2.9 2.1.7a7.3 7.3 0 0 1 1.5-.9l.2-2.1Z"/><circle cx="12" cy="10.5" r="2.7"/></>}
    {name === "temperature" && <><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 11v7"/></>}
    {name === "load" && <><path d="M3 15a9 9 0 0 1 18 0"/><path d="m12 14 4-5M5 18h14"/><circle cx="12" cy="14" r="1" fill="currentColor"/></>}
    {name === "capacity" && <><path d="M4 19V5m0 14h16"/><path d="m7 15 4-4 3 2 5-6"/></>}
  </svg>;
}

function ThemePicker({ value, onChange, className = "" }: { value: Theme; onChange: (value: Theme) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const selected = themes.find(theme => theme.value === value) ?? themes[0];
  return <div className={`theme-picker ${className}`} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }} onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
    <button className="theme-picker-trigger" type="button" aria-label="Megjelenési téma" aria-expanded={open} onClick={() => setOpen(current => !current)}><i style={{ backgroundColor: selected.color }} /><span>{selected.label}</span><b>⌄</b></button>
    {open && <div className="theme-picker-menu" role="listbox" aria-label="Témák">{themes.map(theme => <button key={theme.value} type="button" role="option" aria-selected={value === theme.value} className={value === theme.value ? "selected" : ""} onClick={() => { onChange(theme.value); setOpen(false); }}><i style={{ backgroundColor: theme.color }} />{theme.label}{value === theme.value && <b>✓</b>}</button>)}</div>}
  </div>;
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

type Sensor = { Name?: string; SensorType?: string; Value?: number | null; Status?: string; Identifier?: string };
type Device = { Name?: string; HardwareType?: string; Sensors?: Sensor[] };
type CpuCoreReading = { number: number; load: number | null; clock: number | null; temperature: number | null };
type GuardianEvent = { Id: string; Device: string; Sensor: string; Severity: string; Message: string; StartedAt: string; IsActive: boolean; ResolvedAt?: string | null };
type HealthReport = { Score: number | null; CoveragePercent: number; Status: string; Reasons: string[] };
type WindowsInfo = { WindowsEdition?: string | null; WindowsVersion?: string | null; Manufacturer?: string | null; Model?: string | null; ModelSource?: string | null; SystemType?: string | null; UsableMemoryGb?: number | null; IsActivated?: boolean | null };
type Snapshot = { Timestamp?: string; ComputerName?: string; OperatingSystem?: string; Architecture?: string; LogicalProcessorCount?: number; WindowsInfo?: WindowsInfo; Devices?: Device[]; Health?: HealthReport; GuardianEvents?: GuardianEvent[] };
type GameProcess = { processId: number; processName: string };
type GameFpsStatus = { isRunning: boolean; processId: number | null; processName: string | null; fps: number | null; averageFps: number | null; onePercentLowFps: number | null; frameTimeMs: number | null; message: string };
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

function readSavedAutoFpsGames(): string[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem("nexus-fps-auto-games") ?? "[]");
    return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string" && value.length > 0).slice(0, 12) : [];
  } catch {
    return [];
  }
}

function readSavedAutoFpsEnabled(): boolean {
  try { return window.localStorage.getItem("nexus-fps-auto-enabled") !== "false"; } catch { return true; }
}

function readSavedBackground(): string {
  try {
    const saved = window.localStorage.getItem("nexus-custom-background");
    return saved?.startsWith("data:image/") ? saved : "";
  } catch {
    return "";
  }
}
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
  const found = normalized.length === 0 ? candidates[0] :
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
    "cpu package": "CPU-csomag", "cpu total": "Teljes CPU-terhelés", "core (tctl/tdie)": "Processzormag (Tctl/Tdie)",
    "gpu hot spot": "GPU-hotspot", "gpu temperature": "GPU-hőmérséklet", "physical memory": "Fizikai memória",
  };
  return known[name.trim().toLowerCase()] ?? name;
}
function translateSeverity(severity: string): string {
  return severity === "Critical" ? "Kritikus" : severity === "Warning" ? "Figyelmeztetés" : severity;
}
function guardianMessageSummary(event: GuardianEvent): string {
  const current = event.Message.match(/:\s*(-?\d+(?:[.,]\d+)?)\s*(°C|%)/i);
  const threshold = event.Message.match(/(?:threshold(?:\s+is)?|küszöb)\s*:?\s*(-?\d+(?:[.,]\d+)?)\s*(°C|%)/i);
  const thresholdLabel = event.Severity.toLowerCase() === "critical" ? "kritikus küszöb" : "figyelmeztetési küszöb";
  if (current && threshold) return `Mért érték: ${current[1]} ${current[2]} · ${thresholdLabel}: ${threshold[1]} ${threshold[2]}.`;
  return `A mért érték átlépte a beállított ${thresholdLabel} értékét.`;
}
function guardianGuidance(event: GuardianEvent): string {
  const sensor = `${event.Sensor} ${event.Message}`.toLowerCase();
  const context = `${sensor} ${event.Device}`.toLowerCase();
  if (/storage|ssd|nvme|drive|tárhely|meghajt|composite/.test(context))
    return "Ellenőrizd a meghajtó hűtését és a ház légáramlását, különösen NVMe SSD-nél a hűtőbordát. Nézd meg a meghajtó állapotát és a SMART-jelzéseket. Ha a magas hőmérséklet tartós vagy hibajelzés is megjelenik, készíts biztonsági másolatot, és csökkentsd a nagy lemezterhelést.";
  if (/memory|ram|physical memory|memória/.test(context))
    return "Nyisd meg a Feladatkezelő → Folyamatok nézetet, és rendezd a listát memóriahasználat szerint. Zárd be a szükségtelen programokat, majd ellenőrizd, visszaesik-e a használat. Ha egy alkalmazás folyamatosan növeli a memóriaigényét, indítsd újra vagy frissítsd.";
  if (/cpu|processor|processzor|tctl|tdie|package/.test(sensor))
    return "Ellenőrizd, hogy a CPU-hűtő ventilátora vagy pumpája működik-e, nincs-e por a hűtőn, és szabad-e a ház légáramlása. Nézd meg a Feladatkezelőben, melyik folyamat terheli a processzort. Tartós kritikus hőmérsékletnél állítsd le a nagy terhelést, és hagyd lehűlni a gépet.";
  if (/gpu|graphics|geforce|grafikus|videokártya/.test(context))
    return "Ellenőrizd, hogy a videókártya ventilátorai terhelés alatt forognak-e, nincs-e por a hűtőn, és kap-e levegőt a kártya. Csökkentsd vagy zárd be a játék terhelését, majd figyeld meg, visszaesik-e a hőmérséklet. Tartós kritikus értéknél ne folytasd a terhelést.";
  return "Ellenőrizd a jelzett eszköz szenzorértékét, hűtését és aktuális terhelését. Ha az érték tartósan a küszöb felett marad, csökkentsd a terhelést, és nézd meg, ismétlődik-e a riasztás.";
}function translateSensorType(type: string | undefined): string {
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

function UtilizationRing({ value, caption, color }: { value: number | null; caption: string; color: string }) {
  const percent = value === null ? 0 : Math.max(0, Math.min(100, value));
  return <div className="utilization-ring" style={{ "--ring-color": color, "--ring-progress": `${percent}%` } as React.CSSProperties} aria-label={`${caption}: ${value === null ? "N/A" : `${Math.round(value)}%`}`}>
    <div><strong>{value === null ? "N/A" : `${Math.round(value)}%`}</strong></div>
  </div>;
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

function MiniTrend({ values, color, label }: { values: (number | null)[]; color: string; label: string }) {
  const points = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (points.length < 2) return <div className="overview-trend-wrap overview-trend-empty"><span>Az előzmények gyűjtése folyamatban</span><small>Terhelés · utóbbi 60 mp</small></div>;
  const low = Math.min(...points);
  const high = Math.max(...points);
  const spread = Math.max(high - low, 1);
  const line = points.map((value, index) => `${index === 0 ? "M" : "L"} ${(index / (points.length - 1) * 240).toFixed(1)} ${(34 - ((value - low) / spread) * 25).toFixed(1)}`).join(" ");
  return <div className="overview-trend-wrap"><svg className="overview-trend" viewBox="0 0 240 40" role="img" aria-label={`${label} terhelési előzménye`}><path d={`${line} L 240 40 L 0 40 Z`} fill={color} opacity=".12"/><path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg><small>Terhelés · utóbbi 60 mp</small></div>;
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
            <button type="button" className={isVisible ? "cooling-series-toggle" : "cooling-series-toggle is-hidden"} aria-pressed={isVisible} aria-label={`${item.label} görbe ${isVisible ? "elrejtése" : "megjelenítése"}`} onClick={() => setHiddenSeries(current => current.includes(item.key) ? current.filter(key => key !== item.key) : [...current, item.key])}>
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
  const icon: ModuleIconName = label.startsWith("CPU") ? "cpu" : label.startsWith("GPU") ? "gpu" : "memory";
  return <article className="performance-stat-card" style={{ "--stat-accent": color } as React.CSSProperties}><span><ModuleIcon name={icon}/>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function App() {
  const [active, setActive] = useState("Áttekintés");
  const [detailSensorListExpanded, setDetailSensorListExpanded] = useState(true);
  const [theme, setTheme] = useState<Theme>(readSavedTheme);
  const [expanded, setExpanded] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceSample[]>([]);
  const [gameProcesses, setGameProcesses] = useState<GameProcess[]>([]);
  const [selectedGameProcessId, setSelectedGameProcessId] = useState("");
  const [autoFpsEnabled, setAutoFpsEnabled] = useState(readSavedAutoFpsEnabled);
  const [autoFpsGames, setAutoFpsGames] = useState<string[]>(readSavedAutoFpsGames);
  const [customBackground, setCustomBackground] = useState(readSavedBackground);
  const [backgroundMessage, setBackgroundMessage] = useState("");
  const [gameFpsStatus, setGameFpsStatus] = useState<GameFpsStatus>({ isRunning: false, processId: null, processName: null, fps: null, averageFps: null, onePercentLowFps: null, frameTimeMs: null, message: "Válassz ki egy futó játékot a méréshez." });
  const [gameFpsError, setGameFpsError] = useState("");
  const autoFpsStarting = useRef(false);
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
    try { window.localStorage.setItem("nexus-fps-auto-enabled", String(autoFpsEnabled)); } catch { /* Optional local preference. */ }
  }, [autoFpsEnabled]);

  useEffect(() => {
    try { window.localStorage.setItem("nexus-fps-auto-games", JSON.stringify(autoFpsGames)); } catch { /* Optional local preference. */ }
  }, [autoFpsGames]);

  useEffect(() => {
    try {
      if (customBackground) window.localStorage.setItem("nexus-custom-background", customBackground);
      else window.localStorage.removeItem("nexus-custom-background");
    } catch { /* Custom backgrounds are optional. */ }
  }, [customBackground]);

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

  useEffect(() => {
    if (active !== "Teljesítmény") return;
    let visible = true;
    const refresh = async () => {
      try {
        const [processes, status] = await Promise.all([
          invoke<GameProcess[]>("get_running_games"),
          invoke<GameFpsStatus>("get_game_fps_status"),
        ]);
        if (!visible) return;
        setGameProcesses(processes);
        setGameFpsStatus(status);
        setSelectedGameProcessId(current => current || (status.processId != null ? String(status.processId) : ""));
        setGameFpsError("");
      } catch (error) {
        if (visible) setGameFpsError(String(error));
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => {
      visible = false;
      window.clearInterval(timer);
    };
  }, [active]);

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
      setThresholdMessage("Elmentve. Az állapotjelző és a Guardian ezeket használja a következő szenzorméréstől.");
    } catch (error) {
      setThresholdMessage("A mentés nem sikerült: " + String(error));
    }
  };
  const chooseBackground = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setBackgroundMessage("Csak képformátum választható háttérnek.");
      return;
    }
    if (file.size > 1_500_000) {
      setBackgroundMessage("Legfeljebb 1,5 MB méretű képet válassz, hogy a beállítás biztonságosan menthető maradjon.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCustomBackground(reader.result);
        setBackgroundMessage(`Beállítva: ${file.name}`);
      }
    };
    reader.onerror = () => setBackgroundMessage("A kiválasztott kép nem olvasható.");
    reader.readAsDataURL(file);
  };
  const refreshGameProcessList = async () => {
    try {
      const processes = await invoke<GameProcess[]>("get_running_games");
      setGameProcesses(processes);
      setGameFpsError("");
    } catch (error) {
      setGameFpsError(String(error));
    }
  };
  const showFpsOverlay = async () => {
    const existing = await WebviewWindow.getByLabel("fps-overlay");
    if (existing) {
      await existing.setAlwaysOnTop(true);
      await existing.show();
      return;
    }
    const overlay = new WebviewWindow("fps-overlay", {
      url: "/?window=fps-overlay",
      title: "NEXUS · Játék FPS",
      width: 430,
      height: 168,
      minWidth: 360,
      minHeight: 144,
      center: true,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      focus: false,
      visible: true,
    });
    overlay.once("tauri://error", event => setGameFpsError("Az FPS átfedő kijelző nem nyílt meg: " + String(event.payload)));
  };
  const startGameFps = async (requestedProcessId?: number, requestedProcessName?: string, automatic = false) => {
    const processId = requestedProcessId ?? Number(selectedGameProcessId);
    if (!Number.isInteger(processId) || processId <= 0) return;
    setGameFpsError("");
    try {
      await invoke("start_game_fps", { processId });
      const processName = requestedProcessName ?? gameProcesses.find(process => process.processId === processId)?.processName ?? null;
      setGameFpsStatus({ isRunning: true, processId, processName, fps: null, averageFps: null, onePercentLowFps: null, frameTimeMs: null, message: automatic ? "A mentett játék elindult · FPS-mérés automatikusan elindítva." : "Várakozás a játék képkockaadataira…" });
      if (processName && !automatic) setAutoFpsGames(current => current.some(name => name.toLocaleLowerCase() === processName.toLocaleLowerCase()) ? current : [...current, processName]);
      await showFpsOverlay();
    } catch (error) {
      setGameFpsError(String(error));
    }
  };

  useEffect(() => {
    if (!autoFpsEnabled || autoFpsGames.length === 0 || gameFpsStatus.isRunning) return;
    let active = true;
    const refresh = async () => {
      if (autoFpsStarting.current) return;
      try {
        const processes = await invoke<GameProcess[]>("get_running_games");
        if (!active) return;
        const candidate = processes.find(process => autoFpsGames.some(name => name.localeCompare(process.processName, undefined, { sensitivity: "accent" }) === 0));
        if (!candidate) return;
        autoFpsStarting.current = true;
        await startGameFps(candidate.processId, candidate.processName, true);
      } catch (error) {
        if (active) setGameFpsError("Az automatikus játékfigyelés hibája: " + String(error));
      } finally {
        autoFpsStarting.current = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [autoFpsEnabled, autoFpsGames, gameFpsStatus.isRunning]);
  const stopGameFps = async () => {
    try {
      await invoke("stop_game_fps");
      setGameFpsStatus({ isRunning: false, processId: null, processName: null, fps: null, averageFps: null, onePercentLowFps: null, frameTimeMs: null, message: "A játék FPS-mérése leállt." });
      const overlay = await WebviewWindow.getByLabel("fps-overlay");
      if (overlay) await overlay.close();
    } catch (error) {
      setGameFpsError(String(error));
    }
  };
  const renderThresholdRow = (label: string, warningKey: keyof ThresholdDraft, criticalKey: keyof ThresholdDraft, unit: string, warningMin: number, warningMax: number, criticalMin: number, criticalMax: number) => (
    <div className="diagnostics-row settings-threshold-row" key={label}>
      <b>{label}</b>
      <span className="threshold-inputs">
        <span className="threshold-value"><label htmlFor={"threshold-" + warningKey}>Figyelmeztetés</label><span className="threshold-stepper">
          <button className="threshold-step-button" type="button" aria-label={label + " figyelmeztetési küszöb csökkentése"} onClick={() => stepThreshold(warningKey, -1, warningMin, warningMax)}>−</button>
          <input id={"threshold-" + warningKey} type="number" min={warningMin} max={warningMax} step="1" value={thresholdDraft[warningKey]} onChange={event => updateThreshold(warningKey, event.target.value)} aria-label={label + " figyelmeztetési küszöb"} />
          <button className="threshold-step-button" type="button" aria-label={label + " figyelmeztetési küszöb növelése"} onClick={() => stepThreshold(warningKey, 1, warningMin, warningMax)}>+</button>
        </span></span>
        <span className="threshold-value"><label htmlFor={"threshold-" + criticalKey}>Kritikus</label><span className="threshold-stepper">
          <button className="threshold-step-button" type="button" aria-label={label + " kritikus küszöb csökkentése"} onClick={() => stepThreshold(criticalKey, -1, criticalMin, criticalMax)}>−</button>
          <input id={"threshold-" + criticalKey} type="number" min={criticalMin} max={criticalMax} step="1" value={thresholdDraft[criticalKey]} onChange={event => updateThreshold(criticalKey, event.target.value)} aria-label={label + " kritikus küszöb"} />
          <button className="threshold-step-button" type="button" aria-label={label + " kritikus küszöb növelése"} onClick={() => stepThreshold(criticalKey, 1, criticalMin, criticalMax)}>+</button>
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
      cpuClock: findSensor(cpu, ["CPU Core", "Core #1", "Core 0"], "Clock"),
      cpuPower: findSensor(cpu, ["CPU Package", "CPU Core", "CPU PPT", "CPU Power"], "Power") ?? findSensor(cpu, [], "Power"),
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

  const isOverview = active === "Áttekintés";
  const pageIcons: Record<string, ModuleIconName> = {
    "Áttekintés": "overview", "Processzor": "cpu", "Grafikus vezérlő": "gpu", "Memória": "memory",
    "Háttértárak": "storage", "Hűtés": "cooling", "Teljesítmény": "performance", "Guardian": "guardian",
    "Rendszer és Windows": "system", "Beállítások": "settings",
  };
  const activePageIcon = pageIcons[active] ?? "system";
  const healthStatusLabel: Record<string, string> = { Good: "Jó", Warning: "Figyelmeztetés", Critical: "Kritikus", InsufficientData: "Kevés adat" };
  const activeGuardianEvents = (snapshot?.GuardianEvents ?? []).filter(event => event.IsActive);
  const criticalGuardianCount = activeGuardianEvents.filter(event => event.Severity.toLowerCase() === "critical").length;
  const guardianAlertStatus = !snapshot ? "unknown" : criticalGuardianCount > 0 ? "critical" : activeGuardianEvents.length > 0 ? "warning" : "good";
  const guardianAlertSummary = !snapshot ? "A riasztási adatok betöltése folyamatban." : activeGuardianEvents.length === 0 ? "Nincs aktív Guardian-riasztás." : `${activeGuardianEvents.length} aktív riasztás · ${criticalGuardianCount} kritikus, ${activeGuardianEvents.length - criticalGuardianCount} figyelmeztetés.`;  const memoryUsedDisplay = metrics.ramUsedGiB === null ? "N/A" : formatMemoryGiB(metrics.ramUsedGiB);
  const storageUsedDisplay = selectedStorage?.usedSpaceGiB == null ? "N/A" : formatMemoryGiB(selectedStorage.usedSpaceGiB);
  const storageTotalDisplay = selectedStorage?.totalSpaceGiB == null ? "N/A" : formatMemoryGiB(selectedStorage.totalSpaceGiB);
  const storageUsePercent = selectedStorage?.usedSpaceGiB != null && selectedStorage.totalSpaceGiB != null && selectedStorage.totalSpaceGiB > 0
    ? Math.max(0, Math.min(100, selectedStorage.usedSpaceGiB / selectedStorage.totalSpaceGiB * 100)) : null;
  const storageWarning = Number(thresholdDraft.storageWarning) || recommendedThresholds.storageWarning;
  const storageCritical = Number(thresholdDraft.storageCritical) || recommendedThresholds.storageCritical;
  const storageTemperatureStatus = selectedStorage?.temperature == null ? "unknown"
    : selectedStorage.temperature >= storageCritical ? "critical"
      : selectedStorage.temperature >= storageWarning ? "warning" : "good";
  const storageTemperatureStatusLabel = storageTemperatureStatus === "critical" ? "Kritikus"
    : storageTemperatureStatus === "warning" ? "Figyelmeztetés"
      : storageTemperatureStatus === "good" ? "Jó" : "N/A";
  const availableStorageTemperatures = metrics.storages.map(drive => drive.temperature).filter((value): value is number => value !== null);
  const storageOverallStatus = metrics.storages.length === 0 || availableStorageTemperatures.length === 0 ? "unknown"
    : availableStorageTemperatures.some(value => value >= storageCritical) ? "critical"
      : availableStorageTemperatures.some(value => value >= storageWarning) ? "warning" : "good";
  const performanceHealthStatus = snapshot?.Health?.Status === "Good" ? "good"
    : snapshot?.Health?.Status === "Warning" ? "warning"
      : snapshot?.Health?.Status === "Critical" ? "critical" : "unknown";
  const temperatureFact = coolingStatus === "good" ? "Hőmérsékletek rendben"
    : coolingStatus === "warning" ? "Hőmérsékleti figyelmeztetés"
      : coolingStatus === "critical" ? "Magas hőmérséklet" : "Hőmérséklet N/A";
  const performanceFact = performanceHealthStatus === "good" ? "Teljesítmény stabil"
    : performanceHealthStatus === "warning" ? "Rendszerállapot: figyelmeztetés"
      : performanceHealthStatus === "critical" ? "Rendszerállapot: kritikus" : "Teljesítmény N/A";
  const storageFact = storageOverallStatus === "good" ? "Háttértárak állapota jó"
    : storageOverallStatus === "warning" ? "Háttértár: figyelmeztetés"
      : storageOverallStatus === "critical" ? "Háttértár: kritikus" : "Háttértár állapota N/A";

  return (
    <main className={`nexus-app theme-${theme}${customBackground ? " has-custom-background" : ""}`} style={customBackground ? { "--nexus-user-background": `url("${customBackground}")` } as React.CSSProperties : undefined}>
      <header className="titlebar">
        <div className="titlebar-summary" data-tauri-drag-region>
          <b className="titlebar-nexus">NEXUS</b>
          <div className="top-hardware-stats" aria-label="Élő hardveradatok">
            <div className="top-hardware-stat"><ModuleIcon name="cpu"/><b>CPU</b><span className="top-stat-value">{display(metrics.cpuTemp, " °C", 0)}</span><i/><span className="top-stat-load">{display(metrics.cpuLoad, "%")}</span></div>
            <div className="top-hardware-stat"><ModuleIcon name="gpu"/><b>GPU</b><span className="top-stat-value">{display(metrics.gpuTemp, " °C", 0)}</span><i/><span className="top-stat-load">{display(metrics.gpuLoad, "%")}</span></div>
            <div className="top-hardware-stat"><ModuleIcon name="memory"/><b>RAM</b><span className="top-stat-value">{memoryUsedDisplay.replace(" GiB", "")}/{memoryTotalDisplay.replace(" GiB", "")}G</span><i/><span className="top-stat-load">{display(metrics.ramLoad, "%")}</span></div>
            <div className="top-hardware-stat top-storage-stat"><ModuleIcon name="storage"/><b>TÁR</b><span className="top-stat-value">{storageUsedDisplay.replace(" GiB", "")}/{storageTotalDisplay.replace(" GiB", "")}G</span><i/><span className="top-stat-load">{storageUsePercent === null ? "N/A" : storageUsePercent.toFixed(0) + "%"}</span></div>
          </div>
        </div>
        <div className="titlebar-actions">
          <ThemePicker value={theme} onChange={setTheme} />
          <div className="user-chip">NX</div>
          <WindowControls />
        </div>
      </header>
      <aside className="sidebar">
        <div className="brand"><img className="nexus-wordmark" src={nexusWordmark} alt="NEXUS Hardware Intelligence"/></div>
        <div className="sidebar-scroll">
          {navigation.map((section) => (
            <div className="nav-section" key={section.group}>
              <div className="nav-label">{section.group}</div>
              {section.items.map(([name, icon]) => (
                <button key={name} className={`nav-item ${active === name ? "active" : ""}`} onClick={() => setActive(name)}>
                  <span className="nav-icon"><ModuleIcon name={icon}/></span><span>{name}</span>
                  {name === "Guardian" && (snapshot?.GuardianEvents ?? []).filter(event => event.IsActive).length > 0 && <i className="nav-alert">{(snapshot?.GuardianEvents ?? []).filter(event => event.IsActive).length}</i>}
                </button>
              ))}
            </div>
          ))}
          <div className="nav-section">
            <button className="nav-label nav-label-button" onClick={() => setExpanded(!expanded)}>RENDSZER <span>{expanded ? "⌄" : "›"}</span></button>
            {expanded && <>
              <button className={`nav-item ${active === "Rendszer és Windows" ? "active" : ""}`} onClick={() => setActive("Rendszer és Windows")}><span className="nav-icon"><ModuleIcon name="system"/></span>Rendszer és Windows</button>
              <button className={`nav-item ${active === "Beállítások" ? "active" : ""}`} onClick={() => setActive("Beállítások")}><span className="nav-icon"><ModuleIcon name="settings"/></span>Beállítások</button>
            </>}
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="engine-status"><span className="status-dot" /><div><b>NEXUS MOTOR</b><small>{engineStatus === "LIVE" ? "Valós szenzoradatok" : engineStatus === "OFFLINE" ? "Nincs kapcsolat" : "Indítás folyamatban"}</small></div><em>{engineStatus === "LIVE" ? "ÉLŐ" : engineStatus === "OFFLINE" ? "KI" : "INDUL"}</em></div>
          <div className="version">NEXUS · 0.3.0</div>
        </div>
      </aside>

      <section className="main-area">
        <div className="content">
          <div className="page-heading">
          <div><div className="eyebrow"><i /> {isOverview ? "ÁTTEKINTÉS" : "ÉLŐ HARDVERADATOK"}</div><div className="page-title-row"><span><ModuleIcon name={activePageIcon}/></span><h1>{active}</h1></div><p>{isOverview ? "A számítógép aktuális állapota és főbb adatai." : "Részletes rendszerfelügyelet és hardverdiagnosztika."}</p></div>
            <div className="heading-actions"><button onClick={() => setActive("Beállítások")}>Beállítások <span>›</span></button><button onClick={() => setActive("Rendszer és Windows")}>Saját PC <span>›</span></button></div>
          </div>

          {isOverview && <>
          <section className={`health-banner health-${(snapshot?.Health?.Status ?? "pending").toLowerCase()}`} aria-label="A rendszer aktuális állapota">
            <div className={`guardian-alert-ring guardian-alert-${guardianAlertStatus}`} role="img" aria-label={guardianAlertSummary}><strong>{snapshot ? activeGuardianEvents.length : "—"}</strong><small>AKTÍV RIASZTÁS</small></div>
            <i className="health-banner-divider"/>
            <div className="health-summary"><span>RENDSZER ÁLLAPOTA</span><strong className="health-status-pill"><i/>{healthStatusLabel[snapshot?.Health?.Status ?? ""] ?? "Adatok betöltése"}</strong><p>{guardianAlertSummary}</p></div>
            <div className="health-status-checks" aria-label="Állapotösszegzés">
              <div><span className={`health-check-mark ${coolingStatus}`} aria-hidden="true">{coolingStatus === "good" ? "✓" : coolingStatus === "unknown" ? "–" : "!"}</span><span>{temperatureFact}</span></div>
              <div><span className={`health-check-mark ${performanceHealthStatus}`} aria-hidden="true">{performanceHealthStatus === "good" ? "✓" : performanceHealthStatus === "unknown" ? "–" : "!"}</span><span>{performanceFact}</span></div>
              <div><span className={`health-check-mark ${storageOverallStatus}`} aria-hidden="true">{storageOverallStatus === "good" ? "✓" : storageOverallStatus === "unknown" ? "–" : "!"}</span><span>{storageFact}</span></div>
            </div>
          </section>

            <section className="hardware-grid">
              <article className="hardware-card cpu-card" role="link" tabIndex={0} aria-label="Processzor részletei" onClick={() => setActive("Processzor")} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive("Processzor"); } }}>
                <header className="overview-card-heading"><span className="card-icon"><ModuleIcon name="cpu"/></span><div><h2>Processzor</h2><small>{metrics.cpuName}</small></div><button className="hardware-card-arrow" type="button" aria-label="Processzor részletei" onClick={event => { event.stopPropagation(); setActive("Processzor"); }}>›</button></header>
                <div className="overview-card-telemetry"><UtilizationRing value={metrics.cpuLoad} caption="CPU-terhelés" color="#25e1cb"/><div className="overview-card-metrics"><div className="overview-card-metric"><span>Hőmérséklet</span><strong>{display(metrics.cpuTemp, " °C", 1)}</strong></div><div className="overview-card-metric"><span>Órajel</span><strong>{display(metrics.cpuClock, " MHz", 0)}</strong></div><div className="overview-card-metric"><span>Fogyasztás</span><strong>{display(metrics.cpuPower, " W", 1)}</strong></div></div></div>
                <MiniTrend values={performanceHistory.map(sample => sample.cpuLoad)} color="var(--accent)" label="Processzor"/>
              </article>
              <article className="hardware-card gpu-card" role="link" tabIndex={0} aria-label="Grafikus vezérlő részletei" onClick={() => setActive("Grafikus vezérlő")} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive("Grafikus vezérlő"); } }}>
                <header className="overview-card-heading"><span className="card-icon"><ModuleIcon name="gpu"/></span><div><h2>Grafikus vezérlő</h2><small>{metrics.gpuName}</small></div><button className="hardware-card-arrow" type="button" aria-label="Grafikus vezérlő részletei" onClick={event => { event.stopPropagation(); setActive("Grafikus vezérlő"); }}>›</button></header>
                <div className="overview-card-telemetry"><UtilizationRing value={metrics.gpuLoad} caption="GPU-terhelés" color="#b58aff"/><div className="overview-card-metrics"><div className="overview-card-metric"><span>Hőmérséklet</span><strong>{display(metrics.gpuTemp, " °C", 1)}</strong></div><div className="overview-card-metric"><span>Órajel</span><strong>{display(metrics.gpuClock, " MHz", 0)}</strong></div><div className="overview-card-metric"><span>VRAM</span><strong>{formatMemoryMiBAsGiB(metrics.gpuMemoryUsedMiB)} / {formatMemoryMiBAsGiB(metrics.gpuMemoryTotalMiB)}</strong></div><div className="overview-card-metric"><span>Fogyasztás</span><strong>{display(metrics.gpuPower, " W", 1)}</strong></div></div></div>
                <MiniTrend values={performanceHistory.map(sample => sample.gpuLoad)} color="#ad89ff" label="Grafikus vezérlő"/>
              </article>
              <article className="hardware-card ram-card" role="link" tabIndex={0} aria-label="Memória részletei" onClick={() => setActive("Memória")} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive("Memória"); } }}>
                <header className="overview-card-heading"><span className="card-icon"><ModuleIcon name="memory"/></span><div><h2>Memória</h2><small>RAM · {display(metrics.ramLoad, "%")} terhelés</small></div><button className="hardware-card-arrow" type="button" aria-label="Memória részletei" onClick={event => { event.stopPropagation(); setActive("Memória"); }}>›</button></header>
                <div className="overview-card-telemetry"><UtilizationRing value={metrics.ramLoad} caption="Memóriahasználat" color="#22d8bd"/><div className="overview-card-metrics"><div className="overview-card-metric"><span>Használat</span><strong>{memoryUsedDisplay}</strong></div><div className="overview-card-metric"><span>Elérhető</span><strong>{formatMemoryGiB(metrics.ramAvailableGiB)}</strong></div><div className="overview-card-metric"><span>Összesen</span><strong>{memoryTotalDisplay}</strong></div></div></div>
                <div className="overview-progress-wrap"><div className="overview-progress"><i style={{ width: `${metrics.ramLoad ?? 0}%` }}/></div><small>Jelenlegi memóriahasználat</small></div>
              </article>
              <article className="hardware-card storage-card" role="link" tabIndex={0} aria-label="Háttértárak részletei" onClick={() => setActive("Háttértárak")} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive("Háttértárak"); } }}>
                <header className="overview-card-heading"><span className="card-icon"><ModuleIcon name="storage"/></span><div><h2>Háttértárak</h2><small>{storageCount} felismert meghajtó</small></div><button className="hardware-card-arrow" type="button" aria-label="Háttértárak részletei" onClick={event => { event.stopPropagation(); setActive("Háttértárak"); }}>›</button></header>
                <div className="overview-card-telemetry"><UtilizationRing value={storageUsePercent} caption="Tárhelyhasználat" color="#ac8aff"/><div className="overview-card-metrics"><div className="overview-card-metric"><span>Hőmérséklet</span><strong>{display(selectedStorage?.temperature ?? null, " °C", 1)}</strong></div><div className="overview-card-metric"><span>Használt</span><strong>{storageUsedDisplay}</strong></div><div className="overview-card-metric"><span>Szabad</span><strong>{selectedStorage?.freeSpaceGiB == null ? "N/A" : formatMemoryGiB(selectedStorage.freeSpaceGiB)}</strong></div><div className="overview-card-metric"><span>Állapot</span><strong className={`storage-state-${storageTemperatureStatus}`}>{storageTemperatureStatusLabel}</strong></div></div></div>
                <div className="storage-pager" aria-label="Meghajtó kiválasztása">
                    <button type="button" aria-label="Előző meghajtó" disabled={storageCount < 2} onClick={event => { event.stopPropagation(); setSelectedStorageIndex((activeStorageIndex + storageCount - 1) % storageCount); }}>‹</button>
                    <span aria-live="polite">{activeStorageIndex + 1} / {storageCount}</span>
                    <button type="button" aria-label="Következő meghajtó" disabled={storageCount < 2} onClick={event => { event.stopPropagation(); setSelectedStorageIndex((activeStorageIndex + 1) % storageCount); }}>›</button>
                    <small>{selectedStorage?.name ?? "Nincs felismert meghajtó"}</small>
                </div>
                <div className="overview-progress-wrap"><div className="overview-progress"><i style={{ width: `${storageUsePercent ?? 0}%` }}/></div><small>Jelenlegi tárhelyhasználat</small></div>
              </article>
            </section>

          <section className="quick-access">
            <button className="quick-card" onClick={() => setActive("Hűtés")}><span className="quick-icon"><ModuleIcon name="cooling"/></span><span><b>Hűtés</b><small>Hőmérsékletek és ventilátorfordulat</small></span><i>›</i></button>
            <button className="quick-card" onClick={() => setActive("Teljesítmény")}><span className="quick-icon"><ModuleIcon name="performance"/></span><span><b>Teljesítmény</b><small>Rendszerterhelés és előzmények</small></span><i>›</i></button>
            <button className="quick-card" onClick={() => setActive("Guardian")}><span className="quick-icon"><ModuleIcon name="guardian"/></span><span><b>Guardian</b><small>Riasztások és állapotváltozások</small></span><i>›</i></button>
            <button className="quick-card" onClick={() => setActive("Beállítások")}><span className="quick-icon"><ModuleIcon name="settings"/></span><span><b>Beállítások</b><small>Téma és riasztási küszöbértékek</small></span><i>›</i></button>
          </section>
          </>}
          {active === "Beállítások" && <section className="diagnostics-panel"><h2>Beállítások</h2>
            <div className="diagnostics-row settings-updater-row"><b>Programfrissítés</b><span>{updateMessage || "Indításkor automatikusan keres új verziót."}</span><div className="settings-updater-actions"><button className="settings-secondary-button" type="button" disabled={updateBusy} onClick={() => void checkForUpdates()}>{updateBusy ? "Ellenőrzés…" : "Frissítések keresése"}</button>{availableUpdate && <button className="settings-save-button" type="button" disabled={updateBusy} onClick={() => void installAvailableUpdate()}>Frissítés telepítése</button>}</div></div>
            <div className="diagnostics-row"><b>Megjelenési téma</b>
              <span><ThemePicker value={theme} onChange={setTheme} className="settings-theme-picker" /></span>
              <small>A választás automatikusan mentésre kerül ezen a gépen.</small>
            </div>
            <div className="settings-extra-section">
              <div className="settings-extra-heading"><ModuleIcon name="settings"/><div><b>Extra beállítások</b><small>Saját háttér, NEXUS telepítő és választható segédprogramok.</small></div></div>
              <div className="settings-extra-grid">
                <article className="settings-extra-card"><b>Háttérkép</b><small>A kiválasztott kép csak ezen a gépen, a jelenlegi téma fölötti háttérként jelenik meg.</small><div><label className="settings-secondary-button file-picker-button">Kép kiválasztása<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => chooseBackground(event.currentTarget.files?.[0] ?? null)} /></label>{customBackground && <button className="settings-secondary-button" type="button" onClick={() => { setCustomBackground(""); setBackgroundMessage("Az egyéni háttér törölve."); }}>Alapértelmezett</button>}</div>{backgroundMessage && <em>{backgroundMessage}</em>}</article>
                <article className="settings-extra-card"><b>NEXUS telepítő</b><small>A tesztkiadások és a teljes telepítő a GitHub kiadási oldalon érhető el. A program ezután saját maga ellenőrzi a frissítéseket.</small><div><button className="settings-secondary-button" type="button" onClick={() => void openUrl("https://github.com/hegehun/nexus/releases")}>Kiadások megnyitása</button></div></article>
              </div>
              <div className="settings-tools-heading"><b>Eszköztelepítő</b><small>Opcionális, külső programok. A NEXUS működéséhez nem szükségesek.</small></div>
              <div className="settings-tool-grid">
                <article><b>Fan Control</b><small>Haladó ventilátorprofilok és görbék.</small><button className="settings-secondary-button" type="button" onClick={() => void openUrl("https://getfancontrol.com/")}>Hivatalos letöltés</button></article>
                <article><b>HWiNFO</b><small>Részletes hardverdiagnosztika és érzékelők.</small><button className="settings-secondary-button" type="button" onClick={() => void openUrl("https://www.hwinfo.com/download/")}>Hivatalos letöltés</button></article>
                <article><b>MSI Afterburner</b><small>Videokártya-hangolás és alternatív játékos kijelző.</small><button className="settings-secondary-button" type="button" onClick={() => void openUrl("https://www.msi.com/Landing/afterburner/graphics-cards")}>Hivatalos letöltés</button></article>
              </div>
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
            <div className="diagnostics-row"><b>Típus</b><span>{snapshot?.WindowsInfo?.Model ?? "N/A"}</span><small>{snapshot?.WindowsInfo?.ModelSource ?? "A BIOS nem adott meg géptípust"}</small></div>
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
            <section className="performance-fps-panel">
              <div className="performance-fps-copy"><h2>Játék FPS</h2><small>{gameFpsStatus.message}</small>
                {gameFpsError && <small className="performance-fps-error">{gameFpsError}</small>}
                <div className="performance-fps-controls">
                  <select aria-label="Mérendő játék kiválasztása" value={selectedGameProcessId} onChange={event => setSelectedGameProcessId(event.target.value)} disabled={gameFpsStatus.isRunning}>
                    <option value="">Válassz futó játékot…</option>
                    {gameProcesses.map(process => <option key={`${process.processId}-${process.processName}`} value={process.processId}>{process.processName} · PID {process.processId}</option>)}
                  </select>
                  <button type="button" onClick={() => void refreshGameProcessList()} disabled={gameFpsStatus.isRunning}>Játéklista frissítése</button>
                  {gameFpsStatus.isRunning
                    ? <button type="button" onClick={() => void stopGameFps()}>Mérés leállítása</button>
                    : <button type="button" onClick={() => void startGameFps()} disabled={!selectedGameProcessId}>Mérés indítása</button>}
                </div>
                <label className="performance-fps-autostart"><input type="checkbox" checked={autoFpsEnabled} onChange={event => setAutoFpsEnabled(event.target.checked)} /> <span>Automatikus indítás</span><small>{autoFpsGames.length ? `A NEXUS figyeli: ${autoFpsGames.join(", ")}` : "Indíts el egyszer egy játékot, hogy a NEXUS megjegyezze."}</small></label>
                <small className="performance-fps-note">A mérés a Windows képkocka-eseményeit olvassa. Ha a Windows hozzáférést tilt, a fióknak Performance Log Users jogosultság szükséges.</small>
              </div>
              <div className="performance-fps-value"><strong>{gameFpsStatus.fps == null ? "N/A" : Math.round(gameFpsStatus.fps)}</strong><span>FPS</span>
                {gameFpsStatus.processName && <small>{gameFpsStatus.processName}</small>}
              </div>
              <div className="performance-fps-session-stats">
                <div><span>Átlag</span><strong>{gameFpsStatus.averageFps == null ? "N/A" : Math.round(gameFpsStatus.averageFps) + " FPS"}</strong></div>
                <div><span>1% low</span><strong>{gameFpsStatus.onePercentLowFps == null ? "N/A" : Math.round(gameFpsStatus.onePercentLowFps) + " FPS"}</strong></div>
                <div><span>Képkockaidő</span><strong>{gameFpsStatus.frameTimeMs == null ? "N/A" : gameFpsStatus.frameTimeMs.toFixed(1) + " ms"}</strong></div>
                <button type="button" className="performance-overlay-open" disabled={!gameFpsStatus.isRunning} onClick={async () => { const overlay = await WebviewWindow.getByLabel("fps-overlay"); if (overlay) { await overlay.setAlwaysOnTop(true); await overlay.show(); } else await startGameFps(); }}>FPS-kijelző megnyitása</button>
              </div>
            </section>
          </div>}
          {active === "Hűtés" && <div className="cooling-view">
            <section className="cooling-summary-panel">
              <div className={`cooling-status-banner cooling-status-${coolingStatus}`} role="status">
                <span><ModuleIcon name="cooling"/>HŰTÉSI ÁLLAPOT</span>
                <strong>{coolingStatus === "critical" ? "Kritikus" : coolingStatus === "warning" ? "Figyelmeztetés" : coolingStatus === "good" ? "Normál" : "N/A"}</strong>
                <small>{coolingStatus === "unknown" ? "Nincs használható hőmérsékletadat." : "CPU, GPU és háttértárak mért hőfokai alapján."}</small>
              </div>
              <div className="cooling-temperature-grid">
                {coolingTemperatureReadings.map(reading => {
                  const level = reading.value === null ? "unknown" : reading.value >= reading.critical ? "critical" : reading.value >= reading.warning ? "warning" : "good";
                  return <article className={`cooling-temperature-card cooling-temperature-${level}`} key={reading.key} style={{ "--cooling-color": reading.color } as React.CSSProperties}>
                    <span><ModuleIcon name="temperature"/>{reading.label}</span>
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
                <div className="cpu-detail-stat"><span><ModuleIcon name="load"/>Összterhelés</span><strong>{display(metrics.cpuLoad, "%")}</strong><small>Logikai processzorok összesen</small></div>
                <div className="cpu-detail-stat"><span><ModuleIcon name="temperature"/>Hőmérséklet</span><strong>{display(metrics.cpuTemp, " °C", 1)}</strong><small>Elérhető CPU hőmérséklet-szenzor</small></div>
                {cpuAverageClock !== null && <div className="cpu-detail-stat"><span><ModuleIcon name="cpu"/>Logikai processzorok átlagos órajele</span><strong>{display(cpuAverageClock, " MHz", 0)}</strong><small>{cpuCoreReadings.filter(core => core.clock !== null).length} szálból mérve</small></div>}
                <div className="cpu-detail-stat"><span><ModuleIcon name="cpu"/>Logikai processzorok</span><strong>{snapshot?.LogicalProcessorCount ?? "N/A"}</strong><small>A Windows által jelentett szám</small></div>
              </div>
            </section>
            <section className="diagnostics-panel cpu-detail-panel">
              <div className="cpu-detail-heading"><h2>Logikai processzoronkénti adatok</h2><small>{cpuCoreReadings.length} felismert szál · a szálak nem külön fizikai magokat jelentenek</small></div>
              <p className="cpu-detail-note">Csak az elérhető szálankénti adatokat jelenítjük meg. A processzor hőmérséklete a fenti összesített értéknél látható.</p>
              {cpuCoreReadings.length === 0
                ? <p>A hardveres adatforrás nem szolgáltat külön magonkénti terhelés-, órajel- vagy hőmérsékletadatot.</p>
                : <div className="cpu-core-grid">{cpuCoreReadings.map(core =>
                  <article className="cpu-core-card" key={"cpu-core-" + core.number}>
                    <div className="cpu-core-card-heading"><b>Logikai szál {core.number}</b><span>{display(core.load, "%")}</span></div>
                    <div className="cpu-core-load-track"><i style={{ width: core.load === null ? "0%" : Math.max(0, Math.min(100, core.load)) + "%" }} /></div>
                    <div className="cpu-core-metrics">
                      {core.clock !== null && <div><small>Órajel</small><strong>{display(core.clock, " MHz", 0)}</strong></div>}
                      {core.temperature !== null && <div><small>Hőmérséklet</small><strong>{display(core.temperature, " °C", 1)}</strong></div>}
                    </div>
                  </article>)}</div>}
            </section>
          </>}
          {active === "Grafikus vezérlő" && <>
            <section className="diagnostics-panel device-detail-panel gpu-detail-panel">
              <h2>{metrics.gpuName} · Áttekintés</h2>
              <div className="cpu-detail-summary-grid">
                <div className="cpu-detail-stat"><span><ModuleIcon name="load"/>GPU-terhelés</span><strong>{display(metrics.gpuLoad, "%")}</strong><small>Élő terhelésadat</small></div>
                <div className="cpu-detail-stat"><span><ModuleIcon name="temperature"/>Hőmérséklet</span><strong>{display(metrics.gpuTemp, " °C", 1)}</strong><small>Elérhető GPU hőmérséklet-szenzor</small></div>
                <div className="cpu-detail-stat"><span><ModuleIcon name="gpu"/>Magórajel</span><strong>{display(metrics.gpuClock, " MHz", 0)}</strong><small>GPU Core</small></div>
                <div className="cpu-detail-stat"><span><ModuleIcon name="performance"/>Teljesítmény</span><strong>{display(metrics.gpuPower, " W", 1)}</strong><small>Ha a GPU szolgáltat ilyen adatot</small></div>
              </div>
            </section>
            <section className="diagnostics-panel device-detail-panel gpu-detail-panel gpu-memory-panel">
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
            <section className="diagnostics-panel device-detail-panel ram-detail-panel">
              <h2>Rendszermemória · Áttekintés</h2>
              <div className="cpu-detail-summary-grid">
                <div className="cpu-detail-stat"><span><ModuleIcon name="capacity"/>Használt memória</span><strong>{formatMemoryGiB(metrics.ramUsedGiB)}</strong><small>Mért fizikai memóriahasználat</small></div>
                <div className="cpu-detail-stat"><span><ModuleIcon name="capacity"/>Szabad memória</span><strong>{formatMemoryGiB(metrics.ramAvailableGiB)}</strong><small>Mért, jelenleg elérhető memória</small></div>
                <div className="cpu-detail-stat"><span><ModuleIcon name="memory"/>Összesen</span><strong>{memoryTotalDisplay}</strong><small>Fizikai memória</small></div>
                <div className="cpu-detail-stat"><span><ModuleIcon name="load"/>Terhelés</span><strong>{display(metrics.ramLoad, "%")}</strong><small>Rendszermemória használata</small></div>
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
                  <div className="storage-device-heading"><span className="storage-device-icon"><ModuleIcon name="storage"/></span><h3>{drive.name}</h3></div>
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
          </div>}                    {active === "Guardian" && <section className="diagnostics-panel guardian-events-panel"><h2>Guardian · Szenzoresemények</h2>{(snapshot?.GuardianEvents ?? []).length === 0 ? <p>Nincs aktív vagy friss riasztás.</p> : <div className="guardian-event-list">{snapshot?.GuardianEvents?.map(event => <article className={`guardian-event-card alert-${event.Severity.toLowerCase()}`} key={event.Id}>
            <header><b>{event.Device} · {translateSensorName(event.Sensor)}</b><span>{translateSeverity(event.Severity)}</span><small>{event.IsActive ? "Aktív" : "Lezárva"}</small></header>
            <p className="guardian-event-message">{guardianMessageSummary(event)}</p>
            <details className="guardian-guidance"><summary>Mit ellenőrizzek?</summary><p>{guardianGuidance(event)}</p></details>
          </article>)}</div>}</section>}
          <footer className="content-footer"><span>NEXUS HARDWARE INTELLIGENCE</span><span><i /> {snapshot ? `LAST UPDATE · ${snapshot.Timestamp ?? "LIVE"}` : (engineError ? `ENGINE ERROR · ${engineError}` : "WAITING FOR HARDWARE DATA")}</span></footer>
        </div>
      </section>
    </main>
  );
}

export default App;
