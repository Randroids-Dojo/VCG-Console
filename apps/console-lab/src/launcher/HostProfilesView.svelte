<script lang="ts">
  import type { LocalProfile } from "./types";
  let { profiles, activeId, status, onselect }: {
    profiles: readonly LocalProfile[];
    activeId: string;
    status: string;
    onselect: (profile: LocalProfile) => void;
  } = $props();
</script>

<header class="view-header"><div><h1 data-tv-critical-text>Profiles</h1></div></header>
{#if profiles.length}
  <div class="profile-list host-profile-list" id="profile-list">
    {#each profiles as profile (profile.id)}
      <button type="button" class:selected={profile.id === activeId} data-tv-action onclick={() => onselect(profile)}>
        <span aria-hidden="true">{profile.id.slice(0, 1).toUpperCase()}</span>
        <strong data-tv-critical-text>{profile.name}</strong>
        <small>{profile.id === activeId ? "Selected" : profile.detail}</small>
      </button>
    {/each}
  </div>
{:else}
  <p data-tv-critical-text>{status}</p>
{/if}
