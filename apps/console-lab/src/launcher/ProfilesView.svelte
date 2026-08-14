<script lang="ts">
  import type { AcceptedPortrait } from "./portrait-capture";
  import type { LocalProfile } from "./types";

  let {
    profiles,
    activeId,
    unassignedCount,
    acceptedPortraits,
    onselect,
    onmanage,
    onportrait,
    onunassigned,
  }: {
    profiles: readonly LocalProfile[];
    activeId: string;
    unassignedCount: number;
    acceptedPortraits: readonly Readonly<AcceptedPortrait>[];
    onselect: (profile: LocalProfile) => void;
    onmanage: (profileId: string | null) => void;
    onportrait: (profileId: string) => void;
    onunassigned: () => void;
  } = $props();

  function select(profile: LocalProfile): void {
    onselect(profile);
  }
</script>

<header class="view-header">
  <div><h1>Who is playing?</h1></div>
</header>
<div class="profile-layout">
  <div class="profile-collection">
    <div class="profile-list" id="profile-list">
      {#each profiles as profile (profile.id)}
        {@const portraitHandle = acceptedPortraits.find((portrait) => portrait.profileId === profile.id)?.renderHandle ?? null}
        <button
          class:selected={profile.id === activeId}
          type="button"
          data-profile={profile.name}
          onclick={() => select(profile)}
        >
          <span
            class:synthetic-portrait={portraitHandle !== null}
            data-portrait-handle={portraitHandle}
            aria-hidden="true"
          >{portraitHandle ? "" : profile.name.slice(0, 1).toUpperCase()}</span><strong>{profile.name}</strong><small>{profile.id === activeId ? "Selected" : profile.detail}{portraitHandle ? " · Synthetic portrait" : ""}</small>
        </button>
      {/each}
      <button class="create-profile" type="button" id="create-profile" onclick={() => onmanage(null)}>
        <span>+</span><strong>Create profile</strong><small>New local player</small>
      </button>
    </div>
    <div class="profile-actions">
      <button
        class="update-profile"
        type="button"
        id="manage-profile"
        disabled={profiles.length === 0}
        onclick={() => onmanage(activeId)}
      >Manage selected profile</button>
      <button
        class="update-profile"
        type="button"
        id="capture-profile-portrait"
        disabled={profiles.length === 0}
        onclick={() => onportrait(activeId)}
      >
        {acceptedPortraits.some((portrait) => portrait.profileId === activeId) ? "Replace synthetic portrait" : "Rehearse portrait capture"}
      </button>
      <button class="unassigned-profile-link" type="button" id="open-unassigned-progress" onclick={onunassigned}>
        Unassigned progress <span>{unassignedCount}</span>
      </button>
    </div>
  </div>
</div>
