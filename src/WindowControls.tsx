import { getCurrentWindow } from "@tauri-apps/api/window";
import "./WindowControls.css";

const appWindow = getCurrentWindow();

export default function WindowControls() {
  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-control minimize"
        aria-label="Minimalizálás"
        title="Minimalizálás"
        onClick={() => void appWindow.minimize()}
      >
        <span />
      </button>

      <button
        type="button"
        className="window-control maximize"
        aria-label="Maximalizálás vagy visszaállítás"
        title="Maximalizálás / visszaállítás"
        onClick={() => void appWindow.toggleMaximize()}
      >
        <span />
      </button>

      <button
        type="button"
        className="window-control close"
        aria-label="Bezárás"
        title="Bezárás"
        onClick={() => void appWindow.close()}
      >
        <span />
      </button>
    </div>
  );
}
