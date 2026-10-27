import { createRoot } from "react-dom/client";
import GlobalProvider from "./contexts/Global";
import Home from "./pages/index";
import Reports from "./pages/reports";
import { usePath } from "./router";
import "./styles/globals.css";

function App() {
  const path = usePath();
  return <GlobalProvider>{path === "/reports" ? <Reports /> : path === "/" ? <Home /> : <p>Not found</p>}</GlobalProvider>;
}

createRoot(document.getElementById("root")!).render(<App />);
