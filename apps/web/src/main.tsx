import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { initDiscordActivity } from "./discord/discordSdk.js";
import "./index.css";

void initDiscordActivity();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found in DOM");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const isProdBuild = (import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD === true;
if (isProdBuild && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal if service worker registration is blocked
    });
  });
}

