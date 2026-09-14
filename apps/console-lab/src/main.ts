import "./styles.css";
import { startConsole } from "./motion-runtime";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root is missing");
let dispose = startConsole(app);
let stopping: Promise<void> | undefined;
let pageVisible = true;
window.addEventListener("pagehide", () => {
  pageVisible = false;
  stopping ??= dispose().catch((error: unknown) => {
    console.error("Console teardown failed", error);
  });
});
window.addEventListener("pageshow", async (event) => {
  pageVisible = true;
  if (!event.persisted || !stopping) return;
  const previousStop = stopping;
  await previousStop;
  if (!pageVisible || stopping !== previousStop) return;
  stopping = undefined;
  dispose = startConsole(app);
});
