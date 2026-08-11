import { createRoot } from "react-dom/client";
import { PopupApp } from "./App";
import "./style.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<PopupApp />);
}
