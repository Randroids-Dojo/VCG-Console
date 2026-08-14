<script lang="ts">
  import { onMount } from "svelte";

  let hidden = $state(false);
  let running = $state(false);
  let ready = $state(false);
  let held = $state(false);

  onMount(() => {
    const params = new URLSearchParams(location.search);
    held = params.has("holdBoot");
    if (params.has("skipBoot")) {
      hidden = true;
      return;
    }

    const frame = requestAnimationFrame(() => (running = true));
    const readyTimer = window.setTimeout(() => {
      ready = true;
      if (!held) hideTimer = window.setTimeout(() => (hidden = true), 360);
    }, 1_100);
    let hideTimer: number | undefined;

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(readyTimer);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    };
  });
</script>

<div class:running class:ready class:held class="boot-screen" id="boot-screen" {hidden} aria-live="polite">
  <div class="boot-mark" aria-label="VCG Console">VCG<span>/</span></div>
  <div class="boot-readout">
    <p id="boot-status">{ready ? "SYSTEM READY" : "STARTING"}</p>
    <div class="signal-line" aria-hidden="true"><span></span></div>
  </div>
</div>
