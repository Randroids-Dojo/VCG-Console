<script lang="ts">
  import { tick } from "svelte";
  import type { LocalProfile } from "./types";
  import {
    UnassignedProgressError,
    type ClaimConflictResolution,
    type UnassignedClaimPlan,
    type UnassignedDeletePlan,
    type UnassignedProgressController,
    type UnassignedProgressEntry,
    type UnassignedProgressSnapshot,
  } from "./unassigned-progress";

  type Flow =
    | "none"
    | "choose-profile"
    | "resolve-conflict"
    | "confirm-claim"
    | "confirm-delete";

  let {
    controller,
    snapshot,
    profiles,
    onback,
    onchanged,
    ontoast,
  }: {
    controller: UnassignedProgressController;
    snapshot: UnassignedProgressSnapshot;
    profiles: readonly LocalProfile[];
    onback: () => void;
    onchanged: (snapshot: UnassignedProgressSnapshot) => void;
    ontoast: (message: string) => void;
  } = $props();

  let selectedId = $state<string | null>(null);
  let flow = $state<Flow>("none");
  let targetProfileId = $state<string | null>(null);
  let pendingClaim = $state.raw<UnassignedClaimPlan | null>(null);
  let pendingDelete = $state.raw<UnassignedDeletePlan | null>(null);
  let returnFocus = $state<HTMLElement | null>(null);
  let dialog = $state<HTMLElement>();

  const selected = $derived(
    snapshot.entries.find((entry) => entry.id === selectedId),
  );
  const targetProfile = $derived(
    profiles.find((profile) => profile.id === targetProfileId),
  );

  $effect(() => {
    if (
      selectedId === null
      || !snapshot.entries.some((entry) => entry.id === selectedId)
    ) {
      selectedId = snapshot.entries[0]?.id ?? null;
    }
  });

  export function cancelPending(): boolean {
    if (flow === "none") return false;
    closeFlow();
    return true;
  }

  function choose(entry: UnassignedProgressEntry): void {
    selectedId = entry.id;
    closeFlow(false);
  }

  function play(): void {
    if (!selected) return;
    try {
      controller.planPlay(selected.id);
      ontoast(`Prototype play intent prepared for ${selected.gameTitle}; ownership did not change.`);
    } catch (error) {
      ontoast(error instanceof Error ? error.message : "This entry cannot be played.");
    }
  }

  function beginClaim(event: MouseEvent): void {
    if (!selected || profiles.length === 0) return;
    rememberFocus(event);
    targetProfileId = null;
    pendingClaim = null;
    flow = "choose-profile";
    void focusDialog();
  }

  function chooseTarget(profile: LocalProfile): void {
    if (!selected) return;
    targetProfileId = profile.id;
    pendingClaim = null;
    const inspection = controller.inspectClaim(selected.id, profile.id);
    if (inspection.conflict) {
      flow = "resolve-conflict";
      void focusDialog();
      return;
    }
    pendingClaim = controller.planClaim(selected.id, profile.id);
    flow = "confirm-claim";
    void focusDialog();
  }

  function resolveConflict(resolution: ClaimConflictResolution): void {
    if (!selected || !targetProfileId) return;
    try {
      pendingClaim = controller.planClaim(
        selected.id,
        targetProfileId,
        resolution,
      );
      flow = "confirm-claim";
      void focusDialog();
    } catch (error) {
      ontoast(error instanceof Error ? error.message : "That resolution is unavailable.");
    }
  }

  function confirmClaim(): void {
    if (!pendingClaim || !selected || !targetProfile) return;
    const gameTitle = selected.gameTitle;
    const profileName = targetProfile.name;
    try {
      onchanged(controller.commit(pendingClaim));
      closeFlow(false);
      void focusSelectedEntry();
      ontoast(`Prototype claim completed: ${gameTitle} to ${profileName}.`);
    } catch (error) {
      handleStale(error);
    }
  }

  function beginDelete(event: MouseEvent): void {
    if (!selected) return;
    rememberFocus(event);
    pendingDelete = controller.planDelete(selected.id);
    flow = "confirm-delete";
    void focusDialog();
  }

  function confirmDelete(): void {
    if (!pendingDelete || !selected) return;
    const gameTitle = selected.gameTitle;
    try {
      onchanged(controller.commit(pendingDelete));
      closeFlow(false);
      void focusSelectedEntry();
      ontoast(`Prototype deletion completed for ${gameTitle}.`);
    } catch (error) {
      handleStale(error);
    }
  }

  function handleStale(error: unknown): void {
    closeFlow(false);
    ontoast(
      error instanceof UnassignedProgressError
        ? `${error.message}. Review the current entry and try again.`
        : "The entry changed. Review it and try again.",
    );
  }

  function rememberFocus(event: MouseEvent): void {
    returnFocus = event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : null;
  }

  async function focusDialog(): Promise<void> {
    await tick();
    dialog?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
  }

  function trapDialogFocus(event: KeyboardEvent): void {
    if (event.key !== "Tab" || !dialog) return;
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled])',
      ),
    ].filter((element) => element.offsetParent !== null);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function focusSelectedEntry(): Promise<void> {
    await tick();
    await tick();
    document
      .querySelector<HTMLElement>(
        '[data-launcher-view="unassigned"] .unassigned-list button[aria-pressed="true"]',
      )
      ?.focus();
  }

  function closeFlow(restoreFocus = true): void {
    flow = "none";
    targetProfileId = null;
    pendingClaim = null;
    pendingDelete = null;
    if (restoreFocus) {
      const target = returnFocus;
      void tick().then(() => target?.focus());
    }
  }

  function compatibilityLabel(entry: UnassignedProgressEntry): string {
    if (entry.compatibility === "ready") return "Ready to play";
    if (entry.compatibility === "update-required") {
      return `Needs package ${entry.requiredVersion ?? "update"}`;
    }
    return "Game package unavailable";
  }

  function runtimeLabel(entry: UnassignedProgressEntry): string {
    const labels = {
      "remote-web": "Hosted web · local console data",
      "local-web": "Bundled web",
      native: "Native / Godot",
      libretro: "Libretro",
    } as const;
    return labels[entry.runtime];
  }

  function formattedDate(entry: UnassignedProgressEntry): string {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(entry.lastPlayedAt));
  }

  function formattedBytes(entry: UnassignedProgressEntry): string {
    if (entry.bytesUsed < 1024 * 1024) {
      return `${Math.max(1, Math.round(entry.bytesUsed / 1024))} KiB`;
    }
    return `${(entry.bytesUsed / (1024 * 1024)).toFixed(1)} MiB`;
  }
</script>

<header class="view-header unassigned-header">
  <div>
    <button class="text-back" type="button" onclick={onback}><span class="ui-icon ui-icon-arrow-left" aria-hidden="true"></span>Profiles</button>
    <p class="view-kicker">DEVICE-ONLY / UNASSIGNED</p>
    <h1>Progress without a profile.</h1>
  </div>
  <p>Play locally, deliberately claim it, or permanently delete it. The console never guesses who owned it.</p>
</header>

<div class="unassigned-demo-notice" role="note">
  <strong>Prototype sample data</strong>
  <span>No native save broker is connected. Actions change this in-memory preview only.</span>
</div>

{#if snapshot.entries.length === 0}
  <section class="unassigned-empty" aria-live="polite">
    <span aria-hidden="true"></span>
    <div>
      <h2>No unassigned progress</h2>
      <p>Deleting or resetting a profile may preserve compatible console-managed saves here without retaining the deleted profile identity.</p>
    </div>
    <button type="button" onclick={onback}>Return to profiles</button>
  </section>
{:else}
  <div class="unassigned-layout">
    <section class="unassigned-list" aria-label="Unassigned progress">
      {#each snapshot.entries as entry (entry.id)}
        <button
          type="button"
          class:selected={entry.id === selectedId}
          aria-pressed={entry.id === selectedId}
          onclick={() => choose(entry)}
        >
          <span class="unassigned-runtime">{runtimeLabel(entry)}</span>
          <strong>{entry.gameTitle}</strong>
          <small>{entry.slotLabel}</small>
          <b data-compatibility={entry.compatibility}>{compatibilityLabel(entry)}</b>
        </button>
      {/each}
    </section>

    {#if selected}
      <section class="unassigned-detail" aria-labelledby="unassigned-detail-title">
        <p class="view-kicker">{runtimeLabel(selected).toUpperCase()}</p>
        <h2 id="unassigned-detail-title">{selected.gameTitle}</h2>
        <p class="unassigned-slot">{selected.slotLabel}</p>
        <dl>
          <div><dt>Progress</dt><dd>{selected.progressSummary}</dd></div>
          <div><dt>Last played</dt><dd>{formattedDate(selected)}</dd></div>
          <div><dt>Saved by</dt><dd>Package {selected.packageVersion}</dd></div>
          <div><dt>Compatibility</dt><dd>{compatibilityLabel(selected)}</dd></div>
          <div><dt>Local size</dt><dd>{formattedBytes(selected)}</dd></div>
        </dl>
        {#if selected.hostedProgressBoundary === "hosted-service-separate"}
          <p class="hosted-boundary">
            This is console-local browser data only. VibeBots account or service data is separate and is not claimed, deleted, or recovered here.
          </p>
        {/if}
        <p class="loss-boundary">
          No backup, export, migration, or console cloud sync. Factory reset, storage loss, reflash, or console replacement permanently removes this progress.
        </p>
        <div class="unassigned-actions">
          <button type="button" disabled={selected.compatibility !== "ready"} onclick={play}>Play unassigned</button>
          <button type="button" onclick={beginClaim}>Claim to profile</button>
          <button id="delete-unassigned-progress" class="danger" type="button" onclick={beginDelete}>Delete permanently</button>
        </div>
      </section>
    {/if}
  </div>
{/if}

{#if flow !== "none" && selected}
  <div class="unassigned-dialog-scrim">
    <div
      class="unassigned-dialog"
      bind:this={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unassigned-dialog-title"
      tabindex="-1"
      onkeydown={trapDialogFocus}
    >
      {#if flow === "choose-profile"}
        <p class="view-kicker">CLAIM / CHOOSE PROFILE</p>
        <h2 id="unassigned-dialog-title">Who should receive {selected.gameTitle}?</h2>
        <p>This choice uses the selected profile ID only. Names, portraits, and body measurements never infer ownership.</p>
        <div class="claim-profile-list">
          {#each profiles as profile (profile.id)}
            <button type="button" onclick={() => chooseTarget(profile)}>
              <strong>{profile.name}</strong><small>{profile.detail}</small>
            </button>
          {/each}
        </div>
        <button class="secondary" type="button" onclick={() => closeFlow()}>Cancel</button>
      {:else if flow === "resolve-conflict" && targetProfile}
        <p class="view-kicker">CLAIM / CONFLICT</p>
        <h2 id="unassigned-dialog-title">{targetProfile.name} already has this slot.</h2>
        <p>Nothing changes until you choose an explicit resolution and confirm it on the next screen.</p>
        <div class="conflict-options">
          {#if selected.supportsAdditionalSlot}
            <button type="button" onclick={() => resolveConflict("keep-both")}>
              <strong>Keep both</strong><small>Create a separate recovered slot</small>
            </button>
          {/if}
          <button class="danger" type="button" onclick={() => resolveConflict("replace")}>
          <strong>Replace profile slot</strong><small>Permanently remove the profile's current slot</small>
          </button>
          <button type="button" onclick={() => closeFlow()}>
            <strong>Keep current profile progress</strong><small>Cancel this claim safely</small>
          </button>
        </div>
      {:else if flow === "confirm-claim" && targetProfile && pendingClaim}
        <p class="view-kicker">CLAIM / CONFIRM</p>
        <h2 id="unassigned-dialog-title">Claim {selected.slotLabel} to {targetProfile.name}?</h2>
        {#if pendingClaim.conflictResolution === "replace"}
        <p class="dialog-warning">This would permanently replace {targetProfile.name}'s existing {selected.gameTitle} slot. There is no backup or undo.</p>
        {:else if pendingClaim.conflictResolution === "keep-both"}
          <p>The existing profile slot remains, and this progress becomes a separate recovered slot.</p>
        {:else}
          <p>This moves ownership to the selected local profile. It does not create a backup or copy data to another console.</p>
        {/if}
        <div class="dialog-actions">
          <button class:danger={pendingClaim.conflictResolution === "replace"} type="button" onclick={confirmClaim}>
            Confirm claim
          </button>
          <button type="button" onclick={() => closeFlow()}>Cancel</button>
        </div>
      {:else if flow === "confirm-delete" && pendingDelete}
        <p class="view-kicker">DELETE / PERMANENT</p>
        <h2 id="unassigned-dialog-title">Delete {selected.gameTitle} · {selected.slotLabel}?</h2>
        <p class="dialog-warning">This permanently removes the selected console-managed save. There is no backup, export, cloud copy, migration, or undo.</p>
        {#if selected.hostedProgressBoundary === "hosted-service-separate"}
          <p>Hosted-service account data remains separate and is not affected.</p>
        {/if}
        <div class="dialog-actions">
          <button id="cancel-unassigned-progress-delete" type="button" onclick={() => closeFlow()}>Cancel</button>
          <button id="confirm-unassigned-progress-delete" class="danger" type="button" onclick={confirmDelete}>Delete this progress</button>
        </div>
      {/if}
      <p class="dialog-prototype-boundary">Prototype only · no filesystem mutation</p>
    </div>
  </div>
{/if}
