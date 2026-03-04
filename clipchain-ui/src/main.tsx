import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const ensureFreshBuild = async () => {
  try {
    const response = await fetch("/version.json", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    const latest = typeof data?.version === "string" ? data.version : "";
    if (!latest) return;
    const storageKey = "clipchain:version";
    const reloadKey = "clipchain:reloaded";
    const stored = localStorage.getItem(storageKey);
    const reloaded = sessionStorage.getItem(reloadKey);
    if (stored && stored !== latest) {
      if (reloaded !== latest) {
        localStorage.setItem(storageKey, latest);
        sessionStorage.setItem(reloadKey, latest);
        const url = new URL(window.location.href);
        url.searchParams.set("v", latest);
        window.location.replace(url.toString());
      } else {
        localStorage.setItem(storageKey, latest);
      }
      return;
    }
    localStorage.setItem(storageKey, latest);
    if (reloaded && reloaded !== latest) {
      sessionStorage.removeItem(reloadKey);
    }
  } catch {
    // Non-fatal: continue booting without forced refresh.
  }
};

void ensureFreshBuild();

const registerChunkErrorHandler = () => {
  const reloadOnce = () => {
    const key = "clipchain:chunk-reload";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const url = new URL(window.location.href);
    url.searchParams.set("v", Date.now().toString());
    window.location.replace(url.toString());
  };

  const isChunkError = (message: string) =>
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Loading chunk") ||
    message.includes("Expected a JavaScript-or-Wasm module script");

  window.addEventListener("error", (event) => {
    const target = event.target as HTMLScriptElement | null;
    const src = target?.src || "";
    const message = (event as ErrorEvent).message || "";
    if (isChunkError(message) || (src && src.includes("/assets/"))) {
      reloadOnce();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as Error | undefined;
    const message = reason?.message || "";
    if (isChunkError(message)) {
      reloadOnce();
    }
  });
};

registerChunkErrorHandler();

const container = document.getElementById("root")!;
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
