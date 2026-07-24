<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import type {
    DestructiveProfilePlan,
    ProfileManagementCommitResult,
    ProfileManagementController,
    ProfileManagementDestructiveOperation,
    ProfileManagementSnapshot,
  } from "./profile-management";

  let {
    controller,
    snapshot,
    profileId,
    onchanged,
    oncreated,
    ondeleted,
    onportrait,
    onback,
    ontoast,
  }: {
    controller: ProfileManagementController;
    snapshot: ProfileManagementSnapshot;
    profileId: string | null;
    onchanged: (snapshot: ProfileManagementSnapshot) => void;
    oncreated: (profileId: string) => void;
    ondeleted: (
      profileId: string,
      result: ProfileManagementCommitResult,
    ) => void;
    onportrait: (profileId: string) => void;
    onback: () => void;
    ontoast: (message: string) => void;
  } = $props();

  let name = $state("");
  let pending = $state<DestructiveProfilePlan | null>(null);
  let confirmationReady = $state(false);
  let secondsRemaining = $state(2);
  let returnFocus = $state<HTMLElement | null>(null);
  let dialog = $state<HTMLElement>();
  let nameInput = $state<HTMLInputElement>();
  let timer: number | undefined;

  const profile = $derived(
    snapshot.profiles.find((candidate) => candidate.id === profileId) ?? null,
  );

  $effect(() => {
    if (pending === null) {
      name = profile?.name ?? "";
    }
  });

  onDestroy(stopTimer);

  export function cancelPending(): boolean {
    if (pending === null) return false;
    closeConfirmation();
    return true;
  }

  function saveName(event: SubmitEvent): void {
    event.preventDefault();
    try {
      if (profile) {
        const result = controller.commit(
          controller.planRename(profile.id, name),
          now(),
        );
        onchanged(result.snapshot);
        ontoast(`Display name updated to ${name.trim()}.`);
      } else {
        const result = controller.commit(controller.planCreate(name), now());
        const created = result.snapshot.profiles.at(-1);
        if (!created) throw new Error("Created profile is unavailable.");
        onchanged(result.snapshot);
        oncreated(created.id);
        ontoast(`Local profile created: ${created.name}.`);
      }
    } catch (error) {
      ontoast(messageFor(error));
      void tick().then(() => nameInput?.focus());
    }
  }

  function begin(
    kind: ProfileManagementDestructiveOperation,
    event: MouseEvent,
  ): void {
    if (!profile) return;
    try {
      returnFocus =
        event.currentTarget instanceof HTMLElement
          ? event.currentTarget
          : null;
      pending = controller.planDestructive(kind, profile.id, now());
      confirmationReady = false;
      updateTimer();
      timer = window.setInterval(updateTimer, 100);
      void focusSafeChoice();
    } catch (error) {
      ontoast(messageFor(error));
    }
  }

  function confirm(): void {
    if (!pending || !confirmationReady) return;
    const plan = pending;
    try {
      const result = controller.commit(plan, now());
      onchanged(result.snapshot);
      closeConfirmation(false);
      if (plan.kind === "delete-profile") {
        ondeleted(plan.profileId, result);
        return;
      }
      if (plan.kind === "reset-profile") {
        ontoast(
          "Local identity data reset. The profile and its progress links remain.",
        );
      } else {
        ontoast(
          "Prior calibration and body match cleared. Recalibration is now required.",
        );
      }
      void focusPrimaryAction();
    } catch (error) {
      closeConfirmation(false);
      ontoast(`${messageFor(error)} Review the current profile and try again.`);
      void focusPrimaryAction();
    }
  }

  function closeConfirmation(restoreFocus = true): void {
    pending = null;
    confirmationReady = false;
    stopTimer();
    if (restoreFocus) {
      const target = returnFocus;
      void tick().then(() => target?.focus());
    }
  }

  function updateTimer(): void {
    if (!pending) return;
    const remaining = pending.confirmAfterMs - now();
    secondsRemaining = Math.max(0, Math.ceil(remaining / 1_000));
    if (remaining <= 0) {
      confirmationReady = true;
      stopTimer();
    }
  }

  function stopTimer(): void {
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  }

  async function focusSafeChoice(): Promise<void> {
    await tick();
    dialog
      ?.querySelector<HTMLElement>('[data-safe-choice="true"]')
      ?.focus({ preventScroll: true });
  }

  async function focusPrimaryAction(): Promise<void> {
    await tick();
    document
      .querySelector<HTMLElement>(
        '[data-launcher-view="profile-management"] .profile-management-actions button',
      )
      ?.focus({ preventScroll: true });
  }

  function trapDialogFocus(event: KeyboardEvent): void {
    if (event.key !== "Tab" || !dialog) return;
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>("button:not([disabled])"),
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

  function operationTitle(
    kind: ProfileManagementDestructiveOperation,
  ): string {
    if (kind === "recalibrate-profile") return "Require recalibration?";
    if (kind === "reset-profile") return "Reset local identity data?";
    return "Delete this local profile?";
  }

  function confirmationLabel(
    kind: ProfileManagementDestructiveOperation,
  ): string {
    if (kind === "recalibrate-profile") return "Require recalibration";
    if (kind === "reset-profile") return "Reset identity data";
    return "Delete profile";
  }

  function now(): number {
    return Math.floor(performance.now());
  }

  function messageFor(error: unknown): string {
    return error instanceof Error
      ? error.message
      : "Profile management operation failed.";
  }
</script>

<header class="view-header profile-management-header">
  <div>
    <button class="text-back" type="button" onclick={onback}>← Profiles</button>
    <p class="view-kicker">LOCAL PROFILE MANAGEMENT / DESK REHEARSAL</p>
    <h1>{profile ? `Manage ${profile.name}.` : "Create a local profile."}</h1>
  </div>
  <p>Anyone using this console can manage local profiles. A name, portrait, or body match is never a credential.</p>
</header>

<div class="profile-management-notice" role="note">
  <strong>No password · no administrator · synthetic state only</strong>
  <span>This browser rehearsal does not write the native profile registry, vault, saves, camera, or hosted services.</span>
</div>

{#if profile}
  <div class="profile-management-layout">
    <section class="profile-management-summary" aria-labelledby="managed-profile-title">
      <div
        class:synthetic-portrait={profile.portraitPresent}
        class="managed-profile-orbit"
        aria-hidden="true"
      >{profile.portraitPresent ? "◆" : profile.name.slice(0, 1).toUpperCase()}</div>
      <div>
        <p class="view-kicker">SELECTED OPAQUE PROFILE</p>
        <h2 id="managed-profile-title">{profile.name}</h2>
        <dl>
          <div><dt>Portrait</dt><dd>{profile.portraitPresent ? "Synthetic fixture present" : "None"}</dd></div>
          <div><dt>Calibration</dt><dd>{profile.calibrationRevision === null ? "Required" : `Synthetic revision ${profile.calibrationRevision}`}</dd></div>
          <div><dt>Body match</dt><dd>{profile.bodyProfilePresent ? "Synthetic fixture present" : "Not configured"}</dd></div>
          <div><dt>Console progress</dt><dd>{profile.linkedLocalProgressCount} linked item{profile.linkedLocalProgressCount === 1 ? "" : "s"}</dd></div>
          <div><dt>Hosted services</dt><dd>{profile.hostedServiceCount} separate service{profile.hostedServiceCount === 1 ? "" : "s"}</dd></div>
        </dl>
      </div>
    </section>

    <section class="profile-management-panel" aria-labelledby="profile-name-heading">
      <p class="view-kicker">DISPLAY NAME / NOT IDENTITY</p>
      <h2 id="profile-name-heading">Rename this profile</h2>
      <form onsubmit={saveName}>
        <label for="managed-profile-name">Display name</label>
        <input
          bind:this={nameInput}
          bind:value={name}
          id="managed-profile-name"
          maxlength="24"
          autocomplete="off"
        />
        <p>Duplicate names are allowed. Renaming never moves progress or authenticates an operation.</p>
        <button type="submit">Save display name</button>
      </form>
    </section>

    <section class="profile-management-panel" aria-labelledby="profile-actions-heading">
      <p class="view-kicker">EXPLICIT OPERATIONS</p>
      <h2 id="profile-actions-heading">Choose one scope</h2>
      <div class="profile-management-actions">
        <button type="button" onclick={() => onportrait(profile.id)}>
          <strong>{profile.portraitPresent ? "Replace portrait rehearsal" : "Open portrait rehearsal"}</strong>
          <span>Dedicated notice, countdown, preview, and acceptance.</span>
        </button>
        <button type="button" onclick={(event) => begin("recalibrate-profile", event)}>
          <strong>Require recalibration</strong>
          <span>Clears calibration and body-match fixtures; keeps portrait, profile, and progress.</span>
        </button>
        <button type="button" onclick={(event) => begin("reset-profile", event)}>
          <strong>Reset local identity data</strong>
          <span>Clears portrait, calibration, and body match; keeps the profile and linked progress.</span>
        </button>
        <button class="profile-delete-entry" type="button" onclick={(event) => begin("delete-profile", event)}>
          <strong>Delete local profile</strong>
          <span>Removes identity data and unassigns console-managed progress without deleting it.</span>
        </button>
      </div>
    </section>
  </div>
{:else}
  <section class="profile-create-panel" aria-labelledby="create-profile-heading">
    <p class="view-kicker">NEW OPAQUE LOCAL PROFILE / SYNTHETIC</p>
    <h2 id="create-profile-heading">Choose a display name.</h2>
    <p>The rehearsal allocates a new opaque fixture ID. A repeated display name never inherits old progress, portrait, calibration, or body-match data.</p>
    <form onsubmit={saveName}>
      <label for="managed-profile-name">Display name</label>
      <input
        bind:this={nameInput}
        bind:value={name}
        id="managed-profile-name"
        maxlength="24"
        autocomplete="off"
      />
      <div>
        <button type="submit">Create local profile</button>
        <button type="button" onclick={onback}>Cancel</button>
      </div>
    </form>
  </section>
{/if}

{#if pending && profile}
  <div
    class="profile-management-dialog-backdrop"
    role="presentation"
    onkeydown={trapDialogFocus}
  >
    <div
      bind:this={dialog}
      class="profile-management-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-management-dialog-title"
      aria-describedby="profile-management-dialog-scope"
    >
      <p class="view-kicker">REVIEW EXACT SCOPE</p>
      <h2 id="profile-management-dialog-title">{operationTitle(pending.kind)}</h2>
      <div id="profile-management-dialog-scope">
        <p><strong>{pending.expectedName}</strong> is the only local profile in scope.</p>
        {#if pending.kind === "recalibrate-profile"}
          <ul>
            <li>Clear the current calibration fixture: {pending.expectedCalibrationRevision === null ? "already empty" : `revision ${pending.expectedCalibrationRevision}`}.</li>
            <li>Clear the body-match fixture: {pending.expectedBodyProfilePresent ? "present" : "already empty"}.</li>
            <li>Keep the portrait, profile, and {pending.expectedProgressIds.length} linked progress item{pending.expectedProgressIds.length === 1 ? "" : "s"}.</li>
          </ul>
        {:else if pending.kind === "reset-profile"}
          <ul>
            <li>Remove the portrait: {pending.expectedPortraitRenderHandle === null ? "already empty" : "synthetic fixture present"}.</li>
            <li>Clear calibration and body-match fixtures.</li>
            <li>Keep the profile name and all {pending.expectedProgressIds.length} linked progress item{pending.expectedProgressIds.length === 1 ? "" : "s"}.</li>
          </ul>
        {:else}
          <ul>
            <li>Remove the profile, portrait, calibration, and body-match fixtures.</li>
            <li>Preserve {pending.expectedProgressIds.length} console-managed progress item{pending.expectedProgressIds.length === 1 ? "" : "s"} as unassigned local data.</li>
            <li>Do not attach that progress to a later same-name profile.</li>
            <li>{pending.hostedServiceGameIds.length} hosted service{pending.hostedServiceGameIds.length === 1 ? "" : "s"} {pending.hostedServiceGameIds.length === 1 ? "remains" : "remain"} separate and {pending.hostedServiceGameIds.length === 1 ? "is" : "are"} not deleted by VCG.</li>
          </ul>
          <p class="profile-permanent-warning">Profile deletion has no undo. This prototype does not delete the separately hosted account or service data.</p>
        {/if}
      </div>
      <div class="profile-confirmation-status" aria-live="polite">
        {#if confirmationReady}
          Review complete. Deliberate confirmation is available for 30 seconds.
        {:else}
          Review for {secondsRemaining} second{secondsRemaining === 1 ? "" : "s"} before confirmation is armed.
        {/if}
      </div>
      <div class="profile-management-dialog-actions">
        <button type="button" data-safe-choice="true" onclick={() => closeConfirmation()}>
          Keep profile
        </button>
        <button
          class:profile-delete-confirm={pending.kind === "delete-profile"}
          type="button"
          disabled={!confirmationReady}
          onclick={confirm}
        >
          {confirmationLabel(pending.kind)}
        </button>
      </div>
      <p class="profile-input-copy">Controller or motion Select activates only the focused choice. Back closes this review without changing anything.</p>
    </div>
  </div>
{/if}
