<script lang="ts">
  import { tick } from "svelte";

  interface Profile {
    id: number;
    name: string;
    detail: string;
  }

  let {
    onselect,
    ontoast,
  }: { onselect: (name: string) => void; ontoast: (message: string) => void } = $props();

  let profiles = $state<Profile[]>([
    { id: 1, name: "Randy", detail: "Local player" },
    { id: 2, name: "Guest", detail: "Local guest" },
  ]);
  let activeId = $state(1);
  let nextId = 3;
  let editingId = $state<number | null>(null);
  let editorOpen = $state(false);
  let editorName = $state("");
  let input: HTMLInputElement;

  async function openEditor(profile?: Profile): Promise<void> {
    editingId = profile?.id ?? null;
    editorName = profile?.name ?? "";
    editorOpen = true;
    await tick();
    input.focus();
  }

  function closeEditor(): void {
    editorOpen = false;
    editingId = null;
  }

  function select(profile: Profile): void {
    activeId = profile.id;
    onselect(profile.name);
  }

  function save(event: SubmitEvent): void {
    event.preventDefault();
    const name = editorName.trim();
    if (!name) {
      input.focus();
      return;
    }

    if (editingId !== null) {
      const profile = profiles.find((candidate) => candidate.id === editingId);
      if (!profile) return;
      profile.name = name;
      profiles = [...profiles];
      activeId = profile.id;
      closeEditor();
      onselect(name);
      ontoast(`Profile updated: ${name}`);
      return;
    }

    const profile = { id: nextId++, name, detail: "Local player" };
    profiles = [...profiles, profile];
    activeId = profile.id;
    closeEditor();
    onselect(name);
    ontoast(`Profile created: ${name}`);
  }

  function selectedProfile(): Profile | undefined {
    return profiles.find((profile) => profile.id === activeId);
  }

  function openSelectedEditor(): void {
    const profile = selectedProfile();
    if (!profile) return;
    void openEditor(profile);
  }
</script>

<header class="view-header">
  <div><p class="view-kicker">LOCAL PROFILES</p><h1>Who is playing?</h1></div>
  <p>Profiles and portraits stay on this console.</p>
</header>
<div class="profile-layout">
  <div class="profile-collection">
    <div class="profile-list" id="profile-list">
      {#each profiles as profile (profile.id)}
        <button
          class:selected={profile.id === activeId}
          type="button"
          data-profile={profile.name}
          onclick={() => select(profile)}
        >
          <span>{profile.name.slice(0, 1).toUpperCase()}</span><strong>{profile.name}</strong><small>{profile.id === activeId ? "Selected" : profile.detail}</small>
        </button>
      {/each}
      <button class="create-profile" type="button" id="create-profile" onclick={() => openEditor()}>
        <span>+</span><strong>Create profile</strong><small>New local player</small>
      </button>
    </div>
    <button class="update-profile" type="button" id="edit-profile" onclick={openSelectedEditor}>Update selected profile</button>
  </div>
  <form class="profile-editor" id="profile-editor" hidden={!editorOpen} onsubmit={save}>
    <p class="view-kicker">PROFILE DETAILS</p>
    <label>Name<input bind:this={input} bind:value={editorName} id="profile-name-input" maxlength="24" autocomplete="off" /></label>
    <p>Portrait, motion calibration, and accessibility settings are configured on-device.</p>
    <div><button type="submit">Save profile</button><button type="button" id="cancel-profile" onclick={closeEditor}>Cancel</button></div>
  </form>
</div>
