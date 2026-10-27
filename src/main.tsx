import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { DisplayWindow, displayRoute } from "./ui/display/DisplayWindow";
import { LoginGate } from "./ui/LoginGate";
import "./styles.css";

// Views opened on another monitor load the same page with #display=<view>&id=<id>.
const route = displayRoute();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LoginGate>{route ? <DisplayWindow route={route} /> : <App />}</LoginGate>
  </StrictMode>,
);
