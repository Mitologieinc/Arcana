import "./index.css";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

const theme = localStorage.getItem("arcana.theme");
if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
