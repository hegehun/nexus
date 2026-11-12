
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";
import "./WindowControls.css";

const appWindow = getCurrentWindow();

export default function WindowControls() {
  const handleMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  async function runAction(action: "minimize" | "maximize" | "close") {
    try {
      if (action === "minimize") {
        await appWindow.minimize();
      } else if (action === "maximize") {
        await appWindow.toggleMaximize();
      } else {
        await appWindow.close();
      }
    } catch (error) {
      console.error(`NEXUS ablakkezelesi hiba (${action}):`, error);
    }
  }

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-control minimize"
        title="Minimalizalas"
        aria-label="Minimalizalas"
        onMouseDown={handleMouseDown}
        onClick={() => void runAction("minimize")}
      >
        <span />
      </button>

      <button
        type="button"
        className="window-control maximize"
        title="Maximalizalas / visszaallitas"
        aria-label="Maximalizalas"
        onMouseDown={handleMouseDown}
        onClick={() => void runAction("maximize")}
      >
        <span />
      </button>

      <button
        type="button"
        className="window-control close"
        title="Bezaras"
        aria-label="Bezaras"
        onMouseDown={handleMouseDown}
        onClick={() => void runAction("close")}
      >
        <span />
      </button>
    </div>
  );
}
