<script lang="ts">
  import { tick } from "svelte";
  import type { SearchItem } from "./types";

  let { items }: { items: SearchItem[] } = $props();
  let visible = $state(false);
  let query = $state("");
  let input: HTMLInputElement;
  let panel: HTMLDivElement;
  let results: HTMLDivElement;
  let openedBy: HTMLElement | null = null;
  let matches = $derived(
    items.filter((item) => `${item.title} ${item.detail} ${item.group} ${item.terms}`.toLowerCase().includes(query.trim().toLowerCase())),
  );

  export async function open(): Promise<void> {
    openedBy = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    visible = true;
    query = "";
    await tick();
    input.focus();
  }

  export function close(): void {
    const restoreTarget = openedBy;
    openedBy = null;
    visible = false;
    void tick().then(() => {
      if (restoreTarget?.isConnected) restoreTarget.focus({ preventScroll: true });
    });
  }

  export function isOpen(): boolean {
    return visible;
  }

  function choose(item: SearchItem): void {
    close();
    item.action();
  }

  function handleInputKeydown(event: KeyboardEvent): void {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    results.querySelector<HTMLButtonElement>("button")?.focus();
  }

  function handleDialogKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
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
  <div bind:this={panel} class="search-panel">
    <label id="search-title" for="universal-search" data-tv-critical-text>Search everything</label>
    <div class="search-input-row">
      <span class="search-symbol" aria-hidden="true"></span>
      <input
        bind:this={input}
        bind:value={query}
        onkeydown={handleInputKeydown}
        id="universal-search"
        type="search"
        placeholder="Type a game, hub, or setting"
        autocomplete="off"
        data-tv-action
        data-tv-critical-text
      />
      <kbd data-tv-critical-text>ESC</kbd>
    </div>
    <div bind:this={results} class="search-results" id="search-results">
      {#each matches as item (item.title)}
        <button type="button" data-tv-action onclick={() => choose(item)}>
          <span data-tv-critical-text>{item.group}</span><strong data-tv-critical-text>{item.title}</strong><small>{item.detail}</small><b data-tv-critical-text>→</b>
        </button>
      {/each}
    </div>
    <p class="search-empty" id="search-empty" data-tv-critical-text hidden={matches.length > 0}>No matches. Try a game, hub, profile, or setting.</p>
  </div>
</div>
