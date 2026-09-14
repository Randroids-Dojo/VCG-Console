import "./styles.css";
import { startConsole } from "./motion-runtime";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root is missing");
let dispose = startConsole(app);
let stopping: Promise<void> | undefined;
window.addEventListener("pagehide", () => { stopping = dispose(); });
window.addEventListener("pageshow", async (event) => {
  if (event.persisted) {
    await stopping;
    dispose = startConsole(app);
    stopping = undefined;
  }
});
