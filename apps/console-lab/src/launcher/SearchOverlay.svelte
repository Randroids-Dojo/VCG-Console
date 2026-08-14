<script lang="ts">
  import { tick } from "svelte";
  import type { ConsoleInputAction } from "../gamepad-router";
  import type { SearchItem } from "./types";

  let { items }: { items: SearchItem[] } = $props();
  let visible = $state(false);
  let query = $state("");
  let keysOpen = $state(false);
  let input: HTMLInputElement;
  let panel: HTMLDivElement;
  let results: HTMLDivElement;
  let recovery = $state<HTMLDivElement>();
  let openedBy: HTMLElement | null = null;
  let matches = $derived(
    items.filter((item) => `${item.title} ${item.detail} ${item.group} ${item.terms}`.toLowerCase().includes(query.trim().toLowerCase())),
  );

  // On-screen keyboard for controller and motion input. Rows are ordered so
  // the generic focus ring flows input -> keys -> results.
  const KEY_ROWS: readonly (readonly string[])[] = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m"],
    ["Space", "Delete"],
  ];

  export async function open(): Promise<void> {
    openedBy = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    visible = true;
    query = "";
    keysOpen = false;
    await tick();
    input.focus();
  }

  async function closeAndRestore(): Promise<void> {
    const restoreTarget = openedBy;
    openedBy = null;
    visible = false;
    keysOpen = false;
    await tick();
    if (restoreTarget?.isConnected) {
      restoreTarget.focus({ preventScroll: true });
    }
  }

  export function close(): void {
    void closeAndRestore();
  }

  export function isOpen(): boolean {
    return visible;
  }

  async function openKeys(): Promise<void> {
    if (keysOpen) return;
    keysOpen = true;
    await tick();
  }

  function closeKeys(): void {
    keysOpen = false;
    input.focus({ preventScroll: true });
  }

  function pressKey(key: string): void {
    if (key === "Delete") query = query.slice(0, -1);
    else if (key === "Space") query += " ";
    else query += key;
  }

  function keyButtons(row: number): HTMLButtonElement[] {
    return [...panel.querySelectorAll<HTMLButtonElement>(`[data-key-row="${row}"]`)];
  }

  function focusKeyNear(row: number, from: HTMLElement): void {
    const fromBounds = from.getBoundingClientRect();
    const fromCenter = fromBounds.left + fromBounds.width / 2;
    let best: HTMLButtonElement | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of keyButtons(row)) {
      const bounds = candidate.getBoundingClientRect();
      const distance = Math.abs(bounds.left + bounds.width / 2 - fromCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    best?.focus();
  }

  // Spatial navigation while focus is on an on-screen key; returns true when
  // the action was handled here so the caller skips its linear ring.
  export function handleInput(action: ConsoleInputAction): boolean {
    if (!visible) return false;
    if (action === "back" && keysOpen) {
      closeKeys();
      return true;
    }
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    const row = Number(active.dataset.keyRow);
    const col = Number(active.dataset.keyCol);
    if (!Number.isInteger(row) || !Number.isInteger(col)) return false;
    if (action === "left" || action === "right") {
      const rowKeys = keyButtons(row);
      const next = rowKeys[(col + (action === "left" ? -1 : 1) + rowKeys.length) % rowKeys.length];
      next?.focus();
      return true;
    }
    if (action === "up") {
      if (row === 0) input.focus({ preventScroll: true });
      else focusKeyNear(row - 1, active);
      return true;
    }
    if (action === "down") {
      if (row === KEY_ROWS.length - 1) {
        (
          results.querySelector<HTMLButtonElement>("button")
          ?? recovery?.querySelector<HTMLButtonElement>("button")
        )?.focus();
      } else {
        focusKeyNear(row + 1, active);
      }
      return true;
    }
    return false;
  }

  async function choose(item: SearchItem): Promise<void> {
    await closeAndRestore();
    item.action();
  }

  async function clearSearch(): Promise<void> {
    query = "";
    await tick();
    input.focus({ preventScroll: true });
  }

  async function chooseRecoveryCategory(category: string): Promise<void> {
    query = category;
    await tick();
    results.querySelector<HTMLButtonElement>("button")?.focus({
      preventScroll: true,
    });
  }

  function handleInputKeydown(event: KeyboardEvent): void {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    (
      results.querySelector<HTMLButtonElement>("button")
      ?? recovery?.querySelector<HTMLButtonElement>("button")
    )?.focus();
  }

  function handleDialogKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (keysOpen) closeKeys();
      else close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])")].filter(
      (element) => element.offsetParent !== null,
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<div
  class="search-overlay"
  id="search-overlay"
  hidden={!visible}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-labelledby="search-title"
  onkeydown={handleDialogKeydown}
  onclick={(event) => {
    if (event.currentTarget === event.target) close();
  }}
  >
  <div bind:this={panel} class="search-panel" data-keys={keysOpen ? "open" : "closed"}>
    <label id="search-title" for="universal-search" data-tv-critical-text>Search everything</label>
    <div class="search-input-row">
      <span class="search-symbol" aria-hidden="true"></span>
      <input
        bind:this={input}
        bind:value={query}
        onkeydown={handleInputKeydown}
        onclick={() => void openKeys()}
        id="universal-search"
        type="search"
        placeholder="Type a game, hub, or setting"
        autocomplete="off"
        data-tv-action
        data-tv-critical-text
      />
      <kbd data-tv-critical-text>Back</kbd>
    </div>
    {#if keysOpen}
      <div class="search-keys" aria-label="On-screen keyboard">
        {#each KEY_ROWS as row, rowIndex}
          <div class="search-key-row">
            {#each row as key, colIndex}
              <button
                type="button"
                class:search-key-wide={key.length > 1}
                data-key-row={rowIndex}
                data-key-col={colIndex}
                data-tv-action
                onclick={() => pressKey(key)}
              >{key}</button>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
    <div bind:this={results} class="search-results" id="search-results">
      {#each matches as item (item.title)}
        <button type="button" data-tv-action onclick={() => void choose(item)}>
          <span>{item.group}</span><strong data-tv-critical-text>{item.title}</strong><small>{item.detail}</small><b class="ui-icon ui-icon-arrow-right" aria-hidden="true"></b>
        </button>
      {/each}
    </div>
    {#if matches.length === 0}
      <div bind:this={recovery} class="search-recovery" aria-label="Search recovery">
        <p class="search-empty" id="search-empty" data-tv-critical-text>No matches. Clear the query or browse a local category.</p>
        <p class="search-recovery-label" data-tv-critical-text>OFFLINE CATEGORIES</p>
        <div class="search-recovery-actions">
          <button type="button" data-tv-action data-tv-critical-text onclick={() => void clearSearch()}>Clear search</button>
          <button type="button" data-tv-action data-tv-critical-text onclick={() => void chooseRecoveryCategory("motion")}>Motion</button>
          <button type="button" data-tv-action data-tv-critical-text onclick={() => void chooseRecoveryCategory("system")}>System</button>
          <button type="button" data-tv-action data-tv-critical-text onclick={() => void chooseRecoveryCategory("settings")}>Settings</button>
        </div>
      </div>
    {/if}
  </div>
</div>
