import { createRoot } from "react-dom/client";
import { OptionsApp } from "./App";
import "./style.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<OptionsApp />);
}
