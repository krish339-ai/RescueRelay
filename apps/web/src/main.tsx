import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./workspace-type.css";
import "./pipeline.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* Installation remains optional; never interrupt a rescue. */
    });
  });
}
