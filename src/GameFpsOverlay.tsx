import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

type GameFpsStatus = {
  isRunning: boolean;
  processName: string | null;
  fps: number | null;
  averageFps: number | null;
  onePercentLowFps: number | null;
  frameTimeMs: number | null;
  message: string;
};

const emptyStatus: GameFpsStatus = {
  isRunning: false,
  processName: null,
  fps: null,
  averageFps: null,
  onePercentLowFps: null,
  frameTimeMs: null,
  message: "FPS-mérés indítása…",
};

function savedAccent() {
  try {
    switch (window.localStorage.getItem("nexus-theme")) {
      case "purple": return "#b18aff";
      case "green": return "#42dda5";
      case "red": return "#ff637b";
      case "rose": return "#ff708d";
      case "ice": return "#82d9ff";
      case "aurora": return "#22e0c5";
      default: return "#378fff";
    }
  } catch {
    return "#22e0c5";
  }
}

export default function GameFpsOverlay() {
  const [status, setStatus] = useState<GameFpsStatus>(emptyStatus);
  const accent = savedAccent();

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const latest = await invoke<GameFpsStatus>("get_game_fps_status");
        if (active) setStatus(latest);
      } catch {
        if (active) setStatus(current => ({ ...current, message: "Az FPS-adatkapcsolat nem érhető el." }));
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const close = async () => {
    try { await invoke("stop_game_fps"); } catch { /* The overlay should close even when the sampler has already stopped. */ }
    await getCurrentWebviewWindow().close();
  };
  const show = (value: number | null, decimals = 0) => value == null ? "N/A" : value.toFixed(decimals);

  return <main className="fps-overlay-root" style={{ "--fps-accent": accent } as React.CSSProperties}>
    <section className="fps-overlay-card" aria-label="NEXUS játék közbeni FPS kijelző">
      <header className="fps-overlay-header">
        <div className="fps-overlay-brand" data-tauri-drag-region><i />NEXUS <span>JÁTÉK FPS</span>{status.processName && <small>{status.processName}</small>}</div>
        <button type="button" onClick={() => void close()} aria-label="FPS-kijelző bezárása és mérés leállítása">×</button>
      </header>
      <div className="fps-overlay-metrics">
        <article className="fps-overlay-current"><strong>{show(status.fps)}</strong><span>FPS</span></article>
        <article><strong>{show(status.averageFps)}</strong><span>ÁTLAG</span></article>
        <article><strong>{show(status.onePercentLowFps)}</strong><span>1% LOW</span></article>
        <article><strong>{show(status.frameTimeMs, 1)}<small> ms</small></strong><span>KÉPKOCKAIDŐ</span></article>
      </div>
      <footer>{status.message}</footer>
    </section>
  </main>;
}
