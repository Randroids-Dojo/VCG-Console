<script lang="ts">
  import { tick } from "svelte";
  import type { ConsoleInputAction } from "../gamepad-router";
  import { fetchNativeLibraryPage, type NativeLibraryEntry } from "../native-host-client";
  import { CONTROLLER_REQUIRED_DETAIL } from "./controller-launch-gate";
  import type { RetroLibraryBrowse } from "./retro-library";

  type LibraryStatus = "reading" | "ready" | "unavailable";

  let {
    browse,
    visible,
    controllerConnected,
    onlaunch,
    onback,
  }: {
    browse: RetroLibraryBrowse;
    visible: boolean;
    controllerConnected: boolean;
    onlaunch: (entry: NativeLibraryEntry) => void;
    onback: () => void;
  } = $props();

  let status = $state<LibraryStatus>("reading");
  let detail = $state("");
  let list = $state<HTMLElement | undefined>();
  // Which of the view's two focus regions directional input moves through.
  // The list consumes all four directions, so the letters are entered from
  // the top row and left again downward rather than by a fifth button.
  let region = $state<"list" | "letters">("list");
  let letterFocus = $state("");
  // Bumped after every model mutation so the mounted window re-renders. The
  // model is deliberately not reactive state: it holds up to 100,000 entries
  // and only the measured window of rows ever reaches the document.
  let revision = $state(0);
  let walking: Promise<void> | undefined;

  const rows = $derived.by(() => (void revision, browse.rows));
  const selectedIndex = $derived.by(() => (void revision, browse.selectedIndex));
  const entryCount = $derived.by(() => (void revision, browse.entryCount));
  const rowCount = $derived.by(() => (void revision, browse.rowCount));
  const letters = $derived.by(() => (void revision, browse.jumpLetters));
  const selectedLetter = $derived.by(() => (void revision, browse.selectedLetter));
  const walked = $derived.by(() => (void revision, browse.complete));
  const position = $derived(rowCount === 0 ? 0 : (selectedIndex + 1) / rowCount);
  // One letter would only ever select the row the player is already on.
  const jumpAvailable = $derived(letters.length > 1);

  $effect(() => {
    if (!visible) return;
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  $effect(() => {
    const box = list;
    if (!box) return;
    const observer = new ResizeObserver(() => measureWindow());
    observer.observe(box);
    measureWindow();
    return () => observer.disconnect();
  });

  /**
   * Mounts exactly the rows the list box holds.
   *
   * The box is a fixed share of the safe content area, so measuring it rather
   * than assuming a row count is what keeps every mounted row inside the 5%
   * safe area at 1280 x 720 as well as at 4K.
   */
  function measureWindow(): void {
    const box = list;
    const row = box?.querySelector<HTMLElement>("button");
    if (!box || !row || box.clientHeight <= 0) return;
    const rowHeight = row.getBoundingClientRect().height;
    if (rowHeight <= 0) return;
    const gap = Number.parseFloat(getComputedStyle(box).rowGap) || 0;
    if (browse.setWindowRows(Math.floor((box.clientHeight + gap) / (rowHeight + gap)))) {
      revision += 1;
    }
  }

  /** Shows the library, starting or resuming the forward walk. */
  export async function open(): Promise<void> {
    region = "list";
    void walk();
    await focusSelected();
  }

  export function handleInput(action: ConsoleInputAction): void {
    if (region === "letters") {
      if (action === "left") void focusLetterBy(-1);
      else if (action === "right") void focusLetterBy(1);
      else if (action === "down") void leaveLetters();
      else if (action === "select") void jump(letterFocus);
      return;
    }
    if (action === "up" && jumpAvailable && browse.selectedIndex === 0) void enterLetters();
    else if (action === "up") void move(browse.moveBy(-1).moved);
    else if (action === "down") void move(browse.moveBy(1).moved);
    else if (action === "left") void move(browse.moveToSystem(-1).moved);
    else if (action === "right") void move(browse.moveToSystem(1).moved);
    else if (action === "select") activate();
  }

  /**
   * Back leaves the letters, and closes an open title, before leaving the
   * view. Returns false when the view has nothing of its own to close.
   */
  export function handleBack(): boolean {
    if (region === "letters") {
      void leaveLetters();
      return true;
    }
    if (browse.closeVersions()) {
      revision += 1;
      void focusSelected();
      return true;
    }
    return false;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const action = keyAction(event.key);
    if (!action) return;
    event.preventDefault();
    handleInput(action);
  }

  function keyAction(key: string): ConsoleInputAction | undefined {
    if (key === "ArrowUp") return "up";
    if (key === "ArrowDown") return "down";
    if (key === "ArrowLeft") return "left";
    if (key === "ArrowRight") return "right";
    return undefined;
  }

  async function move(moved: boolean): Promise<void> {
    revision += 1;
    if (moved) await focusSelected();
  }

  /** A title with several staged versions opens; anything else launches. */
  function activate(): void {
    if (browse.toggleSelectedVersions()) {
      revision += 1;
      void focusSelected();
      return;
    }
    launchSelected();
  }

  function launchSelected(): void {
    const entry = browse.selected;
    if (entry) onlaunch(entry);
  }

  function choose(index: number): void {
    browse.select(index);
    revision += 1;
    activate();
  }

  function track(index: number): void {
    region = "list";
    if (index === browse.selectedIndex) return;
    browse.select(index);
    revision += 1;
  }

  async function enterLetters(): Promise<void> {
    const current = selectedLetter;
    const first = letters[0];
    const target = current !== undefined && letters.includes(current) ? current : first;
    if (target === undefined) return;
    region = "letters";
    letterFocus = target;
    await focusLetter();
  }

  async function focusLetterBy(delta: number): Promise<void> {
    const at = letters.indexOf(letterFocus);
    const next = letters[Math.min(Math.max(at + delta, 0), letters.length - 1)];
    if (next === undefined || next === letterFocus) return;
    letterFocus = next;
    await focusLetter();
  }

  async function leaveLetters(): Promise<void> {
    region = "list";
    await focusSelected();
  }

  async function jump(letter: string): Promise<void> {
    browse.jumpTo(letter);
    revision += 1;
    region = "list";
    await focusSelected();
  }

  async function focusLetter(): Promise<void> {
    await tick();
    document
      .querySelector<HTMLElement>(
        `[data-launcher-view="retro-library"] [data-library-letter="${letterFocus}"]`,
      )
      ?.focus();
  }

  async function focusSelected(): Promise<void> {
    await tick();
    document
      .querySelector<HTMLElement>(
        `[data-launcher-view="retro-library"] [data-library-index="${browse.selectedIndex}"]`,
      )
      ?.focus();
  }

  function retry(): void {
    browse.reset();
    detail = "";
    status = "reading";
    region = "list";
    revision += 1;
    void open();
  }

  /**
   * Walks the library forward until the host reports the last page.
   *
   * Cursors are forward-only and cannot be constructed, so walking is the only
   * way to reach an entry. The walk therefore runs once per session, in the
   * background, and the rows already read stay usable while it continues.
   */
  async function walk(): Promise<void> {
    if (walking) return walking;
    walking = readAllPages();
    try {
      await walking;
    } finally {
      walking = undefined;
    }
  }

  async function readAllPages(): Promise<void> {
    while (browse.needsMorePages) {
      const wasEmpty = browse.loadedCount === 0;
      const result = await fetchNativeLibraryPage(browse.nextCursor);
      if (!result.ok) {
        detail = result.detail;
        status = "unavailable";
        return;
      }
      if (!browse.accept(result.page)) {
        browse.reset();
        detail = "Rust console host returned an invalid game library page";
        status = "unavailable";
        revision += 1;
        return;
      }
      revision += 1;
      status = "ready";
      if (wasEmpty && visible) await focusSelected();
    }
    status = "ready";
  }

  /**
   * Versions of one title differ only by their markers, so size is what tells
   * two of them apart. It is the only other fact the host publishes about an
   * entry.
   */
  function entrySize(entry: NativeLibraryEntry): string {
    if (entry.sizeBytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(entry.sizeBytes / 1024))} KiB`;
    }
    return `${(entry.sizeBytes / (1024 * 1024)).toFixed(1)} MiB`;
  }
</script>

<header class="view-header">
  <div>
    <button class="text-back" type="button" data-tv-action onclick={onback}><span class="ui-icon ui-icon-arrow-left" aria-hidden="true"></span>Retro</button>
    <h1 data-tv-critical-text>Imported games</h1>
  </div>
</header>

{#if status === "unavailable"}
  <div class="empty-library">
    <span class="empty-glyph" aria-hidden="true"></span>
    <div><strong data-tv-critical-text>Imported games unavailable</strong><p>{detail}</p></div>
    <button type="button" data-tv-action onclick={retry}>Try again</button>
  </div>
{:else if status === "reading"}
  <div class="empty-library" aria-live="polite">
    <span class="empty-glyph" aria-hidden="true"></span>
    <div><strong data-tv-critical-text>Reading the installed game library</strong></div>
  </div>
{:else if entryCount === 0}
  <div class="empty-library">
    <span class="empty-glyph" aria-hidden="true"></span>
    <div><strong data-tv-critical-text>No imported games</strong><p>Import games you are legally entitled to use from USB or a paired computer.</p></div>
  </div>
{:else}
  {#if !controllerConnected}
    <p class="retro-library-notice" role="status">{CONTROLLER_REQUIRED_DETAIL}</p>
  {/if}
  {#if jumpAvailable}
    <div class="retro-library-letters" data-focus-group aria-label="Jump to letter">
      {#each letters as letter (letter)}
        <button
          type="button"
          data-tv-action
          data-tv-critical-text
          data-library-letter={letter}
          class:selected={letter === selectedLetter}
          onclick={() => jump(letter)}
          onfocus={() => { region = "letters"; letterFocus = letter; }}
        >{letter}</button>
      {/each}
    </div>
  {/if}
  <div class="retro-library-body">
    <div class="retro-library-list" bind:this={list} data-focus-group aria-label="Imported games">
      {#each rows as row (row.key)}
        {#if row.kind === "group"}
          <button
            type="button"
            data-tv-action
            data-library-index={row.index}
            data-system-start={row.systemStart ? "" : undefined}
            aria-expanded={row.open}
            class:selected={row.index === selectedIndex}
            onclick={() => choose(row.index)}
            onfocus={() => track(row.index)}
          >
            <strong data-tv-critical-text>{row.title}</strong>
            <em>{row.systemId}</em>
            <small>{row.versions} versions</small>
          </button>
        {:else}
          <button
            type="button"
            data-tv-action
            data-library-index={row.index}
            data-library-version={row.version ? "" : undefined}
            data-system-start={row.systemStart ? "" : undefined}
            class:selected={row.index === selectedIndex}
            onclick={() => choose(row.index)}
            onfocus={() => track(row.index)}
          >
            <strong data-tv-critical-text>{row.entry.title}</strong>
            <em>{row.entry.systemId}</em>
            <small>{entrySize(row.entry)}</small>
          </button>
        {/if}
      {/each}
    </div>
    <div class="retro-library-position" aria-hidden="true"><span style:transform={`scaleY(${position})`}></span></div>
  </div>
  <p class="retro-library-legend">Left and Right change system.{#if jumpAvailable}{" "}Up from the first game selects a letter.{/if}{#if !walked}{" "}<span role="status">Still reading the library. More letters can appear.</span>{/if}</p>
{/if}
