import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/anton/latin-400.css";
import "@fontsource/press-start-2p/latin-400.css";
import "@fontsource-variable/space-grotesk/wght.css";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/editor.css";
import "./styles/preview.css";
import "./styles/responsive.css";
import "./styles/workspace.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("The root element is missing.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
