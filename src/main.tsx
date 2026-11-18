import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import GameFpsOverlay from "./GameFpsOverlay";

const root = document.getElementById("root") as HTMLElement;
const isFpsOverlay = new URLSearchParams(window.location.search).get("window") === "fps-overlay";
if (isFpsOverlay) {
  document.documentElement.classList.add("fps-overlay-document");
  document.body.classList.add("fps-overlay-document");
  root.classList.add("fps-overlay-document");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    {isFpsOverlay ? <GameFpsOverlay /> : <App />}
  </React.StrictMode>,
);
