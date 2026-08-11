<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { ConsoleInputAction } from "../gamepad-router";
  import {
    CIRCUIT_SHIFT_STORAGE_KEY,
    createCircuitShiftGame,
    moveCircuitShift,
    restoreCircuitShift,
    serializeCircuitShift,
    type CircuitShiftDirection,
    type CircuitShiftState,
  } from "./circuit-shift";

  let game = $state<CircuitShiftState>(createCircuitShiftGame());
  let ready = $state(false);

  onMount(() => {
    game = restoreCircuitShift(localStorage.getItem(CIRCUIT_SHIFT_STORAGE_KEY)) ?? game;
    ready = true;
    window.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => window.removeEventListener("keydown", handleKeydown));

  export function handleInput(action: ConsoleInputAction): void {
    if (action === "left" || action === "up" || action === "right" || action === "down") {
      move(action);
    } else if (action === "select" && game.status === "game-over") {
      restart();
    }
  }

  function move(direction: CircuitShiftDirection): void {
    const next = moveCircuitShift(game, direction);
    if (next === game) return;
    game = next;
    persist();
  }

  function restart(): void {
    game = createCircuitShiftGame(Math.random, game.best);
    persist();
  }

  function persist(): void {
    if (!ready) return;
    localStorage.setItem(CIRCUIT_SHIFT_STORAGE_KEY, serializeCircuitShift(game));
  }

  function handleKeydown(event: KeyboardEvent): void {
    const direction = keyDirection(event.key);
    if (direction) {
      event.preventDefault();
      move(direction);
    } else if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      restart();
    }
  }

  function keyDirection(key: string): CircuitShiftDirection | undefined {
    if (key === "ArrowLeft" || key.toLowerCase() === "a") return "left";
    if (key === "ArrowUp" || key.toLowerCase() === "w") return "up";
    if (key === "ArrowRight" || key.toLowerCase() === "d") return "right";
    if (key === "ArrowDown" || key.toLowerCase() === "s") return "down";
    return undefined;
  }

  function chargeClass(value: number): string {
    if (value === 0) return "empty";
    if (value <= 4) return "low";
    if (value <= 16) return "medium";
    if (value <= 64) return "high";
    return "peak";
  }
</script>

<article class="circuit-shift" aria-label="Circuit Shift game">
  <header>
    <div>
      <p>CIRCUIT SHIFT / OFFLINE</p>
      <h1>Build the signal.</h1>
    </div>
    <dl>
      <div><dt>Score</dt><dd data-circuit-score>{game.score}</dd></div>
      <div><dt>Best</dt><dd>{game.best}</dd></div>
    </dl>
  </header>

  <div class="playfield">
    <div class="board" role="grid" aria-label="Circuit board">
      {#each game.board as charge, index}
        <div
          class:empty={charge === 0}
          class:low={chargeClass(charge) === "low"}
          class:medium={chargeClass(charge) === "medium"}
          class:high={chargeClass(charge) === "high"}
          class:peak={chargeClass(charge) === "peak"}
          role="gridcell"
          aria-label={charge === 0 ? `Empty cell ${index + 1}` : `Charge ${charge}`}
        >{charge || ""}</div>
      {/each}
    </div>

    <aside>
      <strong>Match equal charges.</strong>
      <p>Use the D-pad to slide the whole circuit. Matching values combine once per move.</p>
      <p class="controls"><kbd>UP</kbd><kbd>DOWN</kbd><kbd>LEFT</kbd><kbd>RIGHT</kbd> Move<br /><kbd>Home</kbd> Console menu</p>
      <button type="button" data-tv-action onclick={restart}>New circuit</button>
    </aside>
  </div>

  {#if game.status === "game-over"}
    <div class="game-over" role="dialog" aria-modal="true" aria-label="Circuit complete">
      <p>CIRCUIT CLOSED</p>
      <strong>{game.score} points</strong>
      <span>Press Select or start a new circuit.</span>
      <button type="button" data-tv-action onclick={restart}>Play again</button>
    </div>
  {/if}
</article>

<style>
  .circuit-shift {
    position: relative;
    min-height: 100%;
    box-sizing: border-box;
    padding: clamp(1.5rem, 4vw, 4.5rem);
    color: #f5f6ef;
    background:
      radial-gradient(circle at 18% 15%, rgba(103, 255, 190, 0.16), transparent 32%),
      linear-gradient(135deg, #071510, #0c211b 60%, #06100d);
    overflow: hidden;
  }

  header, .playfield, dl { display: flex; }
  header { align-items: end; justify-content: space-between; gap: 2rem; }
  header p { margin: 0 0 0.6rem; color: #70f5b2; font-weight: 800; letter-spacing: 0.16em; }
  h1 { margin: 0; font-size: clamp(2.6rem, 6vw, 6rem); line-height: 0.9; letter-spacing: -0.055em; }
  dl { margin: 0; gap: 0.8rem; }
  dl div { min-width: 7rem; padding: 0.8rem 1.2rem; border: 1px solid rgba(112, 245, 178, 0.35); background: rgba(4, 13, 10, 0.7); }
  dt { color: #9cb2a8; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.13em; text-transform: uppercase; }
  dd { margin: 0.15rem 0 0; font-size: 1.8rem; font-weight: 900; }

  .playfield { align-items: center; justify-content: center; gap: clamp(2rem, 6vw, 7rem); margin-top: clamp(2rem, 5vh, 4rem); }
  .board {
    display: grid;
    grid-template-columns: repeat(4, minmax(4.4rem, 8.2rem));
    gap: clamp(0.45rem, 1vw, 0.9rem);
    padding: clamp(0.7rem, 1.3vw, 1.2rem);
    border: 2px solid rgba(112, 245, 178, 0.32);
    background: rgba(0, 8, 5, 0.72);
    box-shadow: 0 2rem 6rem rgba(0, 0, 0, 0.38);
  }
  .board > div {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #07110d;
    background: #89ffbe;
    font-size: clamp(1.2rem, 2.6vw, 2.5rem);
    font-weight: 950;
    box-shadow: inset 0 0 1.8rem rgba(255, 255, 255, 0.3);
  }
  .board > .empty { border-color: rgba(112, 245, 178, 0.1); background: rgba(112, 245, 178, 0.055); box-shadow: none; }
  .board > .medium { color: #06131a; background: #68ddec; }
  .board > .high { color: #160a20; background: #c18cff; }
  .board > .peak { color: #231200; background: #ffcb61; }

  aside { width: min(22rem, 30vw); color: #bacbc3; font-size: clamp(0.9rem, 1.35vw, 1.15rem); line-height: 1.55; }
  aside strong { color: #f5f6ef; font-size: 1.4em; }
  .controls { margin: 2rem 0; }
  kbd { display: inline-grid; place-items: center; min-width: 1.7rem; min-height: 1.7rem; margin: 0.1rem; border: 1px solid #547366; color: #dff8ec; background: #10271f; font: inherit; font-size: 0.75em; }
  button { padding: 0.9rem 1.3rem; border: 1px solid #70f5b2; color: #071510; background: #70f5b2; font: inherit; font-weight: 900; }
  button:focus-visible { outline: 4px solid #fff; outline-offset: 4px; }

  .game-over {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.8rem;
    background: rgba(3, 10, 7, 0.92);
    text-align: center;
  }
  .game-over p { margin: 0; color: #70f5b2; font-weight: 900; letter-spacing: 0.2em; }
  .game-over strong { font-size: clamp(3rem, 8vw, 7rem); }
  .game-over button { margin-top: 1rem; }

  @media (max-width: 800px) {
    .circuit-shift { overflow: auto; }
    header, .playfield { align-items: stretch; flex-direction: column; }
    .board { grid-template-columns: repeat(4, minmax(3rem, 1fr)); }
    aside { width: auto; }
  }
</style>
