<script lang="ts">
  import { tick } from "svelte";
  import type { SearchItem } from "./types";

  let { items }: { items: SearchItem[] } = $props();
  let visible = $state(false);
  let query = $state("");
  let input: HTMLInputElement;
  let results: HTMLDivElement;
  let matches = $derived(
    items.filter((item) => `${item.title} ${item.detail} ${item.group} ${item.terms}`.toLowerCase().includes(query.trim().toLowerCase())),
  );

  export async function open(): Promise<void> {
    visible = true;
    query = "";
    await tick();
    input.focus();
  }

  export function close(): void {
    visible = false;
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
</script>

<div
  class="search-overlay"
  id="search-overlay"
  hidden={!visible}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-labelledby="search-title"
  onkeydown={(event) => {
    if (event.key === "Escape") close();
  }}
  onclick={(event) => {
    if (event.currentTarget === event.target) close();
  }}
>
  <div class="search-panel">
    <label id="search-title" for="universal-search">Search everything</label>
    <div class="search-input-row">
      <span>⌕</span>
      <input
        bind:this={input}
        bind:value={query}
        onkeydown={handleInputKeydown}
        id="universal-search"
        type="search"
        placeholder="Type a game, hub, or setting"
        autocomplete="off"
      />
      <kbd>ESC</kbd>
    </div>
    <div bind:this={results} class="search-results" id="search-results">
      {#each matches as item (item.title)}
        <button type="button" onclick={() => choose(item)}>
          <span>{item.group}</span><strong>{item.title}</strong><small>{item.detail}</small><b>→</b>
        </button>
      {/each}
    </div>
    <p class="search-empty" id="search-empty" hidden={matches.length > 0}>No matches. Try a game, hub, profile, or setting.</p>
  </div>
</div>
