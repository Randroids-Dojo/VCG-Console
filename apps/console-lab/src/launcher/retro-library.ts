import {
  compareNativeLibraryEntries,
  type NativeLibraryEntry,
  type NativeLibraryPage,
} from "../native-host-client";

/**
 * How many rows the view mounts before it has measured its own list.
 *
 * A library holds up to 100,000 entries, so the list is windowed: only the
 * rows that fit exist in the document, and the window slides with the
 * selection instead of growing. The view replaces this with what its list box
 * actually holds, which is what keeps every mounted row inside the 5% safe
 * area at 1280 x 720 as well as at 4K.
 */
export const RETRO_LIBRARY_WINDOW_ROWS = 6;
export const RETRO_LIBRARY_MIN_WINDOW_ROWS = 3;
export const RETRO_LIBRARY_MAX_WINDOW_ROWS = 24;

/** The jump letter for every title that does not start with A through Z. */
export const RETRO_LIBRARY_OTHER_LETTER = "#";

const MAX_RETRO_LIBRARY_ENTRIES = 100_000;

/** One trailing `(...)` or `[...]` marker, with the space in front of it. */
const TRAILING_MARKER = /\s*(?:\([^()]*\)|\[[^[\]]*\])$/;

/**
 * The title a row groups under: the derived title with its trailing
 * parenthetical and bracketed markers removed.
 *
 * This is a display heuristic over the operator's filenames, not metadata. A
 * ROM set writes `(U)`, `(USA)`, `(E)`, `(Rev 1)`, `[!]`, and `[b1]` by
 * convention; the host publishes none of it as a field, so the shell can only
 * read the shape of a name. Removing a marker therefore says two names look
 * like versions of one title, and says nothing about which file is the
 * authoritative dump. Nothing is renamed either: every staged entry keeps the
 * title it was staged with, and the row a player launches shows it.
 *
 * A title that is nothing but a marker keeps its own text, so unrelated
 * entries never collapse into one empty group.
 */
export function retroLibraryBaseTitle(title: string): string {
  let base = title.trim();
  for (;;) {
    const stripped = base.replace(TRAILING_MARKER, "").trim();
    if (stripped === base || stripped.length === 0) return base;
    base = stripped;
  }
}

/**
 * The letter a title jumps under: its first character folded to A through Z,
 * or `#` for every title that starts with anything else.
 */
export function retroLibraryJumpLetter(title: string): string {
  const first = [...title.trim()][0];
  if (first === undefined) return RETRO_LIBRARY_OTHER_LETTER;
  const upper = first.toUpperCase();
  if (upper.length !== 1 || upper < "A" || upper > "Z") return RETRO_LIBRARY_OTHER_LETTER;
  return upper;
}

/** One title's versions, in the order the host published them. */
interface RetroLibraryGroup {
  /** Entry indices, in host order. The first one is this row's identity. */
  members: number[];
  systemId: string;
  /** The shared title text the display heuristic derived. */
  base: string;
}

interface RetroLibraryLetterStop {
  letter: string;
  group: number;
}

interface RetroLibraryRowBase {
  /** Position in the rendered list. The window addresses rows, not entries. */
  index: number;
  /** The list key. Entry IDs key the list; a title never does. */
  key: string;
  systemId: string;
  /** True when this row opens a new system in the host's ordering. */
  systemStart: boolean;
}

export interface RetroLibraryEntryRow extends RetroLibraryRowBase {
  kind: "entry";
  entry: NativeLibraryEntry;
  /** True when this row is one version inside the open group above it. */
  version: boolean;
}

export interface RetroLibraryGroupRow extends RetroLibraryRowBase {
  kind: "group";
  /** The shared part of its members' titles, never a staged title. */
  title: string;
  /** How many staged entries this row stands for. Always more than one. */
  versions: number;
  open: boolean;
}

export type RetroLibraryRow = RetroLibraryEntryRow | RetroLibraryGroupRow;

export interface RetroLibraryMove {
  moved: boolean;
  /** True when the answer lies past the entries fetched so far. */
  needsMorePages: boolean;
}

/**
 * The browse state for the operator's installed retro library.
 *
 * The host returns entries ordered by system, then title, and pages forward
 * only with opaque cursors: there is no random access and no jump to an index.
 * So this model keeps what it has walked, in host order, and treats every
 * movement past the walked end as a request for the next page rather than a
 * seek. Nothing here renders; the view mounts only the window this reports.
 *
 * Rows are not entries. Entries whose titles differ only by a trailing marker
 * share one row, which opens to show every one of them. That is presentation
 * over the same held entries: no entry is dropped, filtered, or renamed, and
 * an entry that shares its base title with nothing else keeps an ordinary row
 * carrying its full staged title.
 */
export class RetroLibraryBrowse {
  #entries: NativeLibraryEntry[] = [];
  #groups: RetroLibraryGroup[] = [];
  #groupByKey = new Map<string, number>();
  /** The one group whose versions are open, if any. */
  #openGroup: number | undefined;
  #generation: number | undefined;
  #entryCount = 0;
  #nextCursor: string | undefined;
  #complete = false;
  /**
   * The selection, held as the group and the version inside it rather than as
   * a row number, so that reading another page or opening a group renumbers
   * the rows without moving what the player selected.
   */
  #selectedGroup = 0;
  #selectedVersion: number | undefined;
  #windowStart = 0;
  #windowRows = RETRO_LIBRARY_WINDOW_ROWS;
  #letters: { groups: number; systemId: string; stops: RetroLibraryLetterStop[] } | undefined;

  get entries(): readonly NativeLibraryEntry[] {
    return this.#entries;
  }

  get loadedCount(): number {
    return this.#entries.length;
  }

  get entryCount(): number {
    return this.#entryCount;
  }

  get generation(): number | undefined {
    return this.#generation;
  }

  get nextCursor(): string | undefined {
    return this.#nextCursor;
  }

  /** True once the walk has reached the last page of this snapshot. */
  get complete(): boolean {
    return this.#complete;
  }

  get started(): boolean {
    return this.#generation !== undefined;
  }

  /** How many rows the walked entries currently render as. */
  get rowCount(): number {
    return this.#groups.length + this.#openVersions();
  }

  get selectedIndex(): number {
    const row = this.#groupRow(this.#selectedGroup);
    return this.#selectedVersion === undefined ? row : row + 1 + this.#selectedVersion;
  }

  /**
   * The entry the selected row launches.
   *
   * A closed group of several versions has none: it stands for more than one
   * staged file, so it opens instead of launching.
   */
  get selected(): NativeLibraryEntry | undefined {
    const group = this.#groups[this.#selectedGroup];
    if (!group) return undefined;
    const member =
      this.#selectedVersion === undefined
        ? group.members.length === 1
          ? group.members[0]
          : undefined
        : group.members[this.#selectedVersion];
    return member === undefined ? undefined : this.#entries[member];
  }

  get windowStart(): number {
    return this.#windowStart;
  }

  get windowRows(): number {
    return this.#windowRows;
  }

  /**
   * The letters the walked rows of the selected system start with.
   *
   * Only letters that have a row are published, so a jump never lands
   * nowhere, and only the current system is offered: the host orders by
   * system and then by title, so one letter names one run of rows inside a
   * system but many runs across the whole library. While the walk is
   * unfinished this is what has been read so far, which is what
   * `complete` reports.
   */
  get jumpLetters(): readonly string[] {
    return this.#letterStops().map((stop) => stop.letter);
  }

  /** The letter the selected row sits under. */
  get selectedLetter(): string | undefined {
    const group = this.#groups[this.#selectedGroup];
    return group === undefined ? undefined : retroLibraryJumpLetter(group.base);
  }

  /**
   * Sets how many rows the view mounts, reporting whether that changed.
   *
   * The view measures its own list box rather than assuming a row count, so
   * the window is whatever fits inside the safe area of the actual viewport.
   */
  setWindowRows(rows: number): boolean {
    if (!Number.isFinite(rows)) return false;
    const next = Math.min(
      Math.max(Math.floor(rows), RETRO_LIBRARY_MIN_WINDOW_ROWS),
      RETRO_LIBRARY_MAX_WINDOW_ROWS,
    );
    if (next === this.#windowRows) return false;
    this.#windowRows = next;
    this.#clampWindow();
    return true;
  }

  /** The rows the view mounts, and only those. */
  get rows(): RetroLibraryRow[] {
    const end = Math.min(this.#windowStart + this.#windowRows, this.rowCount);
    const rows: RetroLibraryRow[] = [];
    for (let index = this.#windowStart; index < end; index += 1) {
      const row = this.#row(index);
      if (!row) break;
      rows.push(row);
    }
    return rows;
  }

  /**
   * True while pages of this snapshot remain unread.
   *
   * The walk runs to completion in the background rather than lazily, because
   * a cursor is forward-only: a lazy walk would owe an unbounded catch-up
   * fetch to whichever keypress first asks for an entry it has not reached,
   * and the host's own 100,000-entry cap already bounds what a finished walk
   * costs to hold.
   */
  get needsMorePages(): boolean {
    return !this.#complete;
  }

  /**
   * Adds one page to the walk.
   *
   * Returns false when the page does not continue this exact walk of this
   * exact snapshot -- a changed generation or entry count, an entry that does
   * not sort after the last one held, more entries than the library declares,
   * or a final page that does not account for every entry. A rejected page is
   * not partially applied.
   */
  accept(page: NativeLibraryPage): boolean {
    if (this.#complete) return false;
    if (this.#generation === undefined) {
      if (this.#entries.length > 0) return false;
    } else if (page.libraryGeneration !== this.#generation || page.entryCount !== this.#entryCount) {
      return false;
    }
    const total = this.#entries.length + page.entries.length;
    if (total > page.entryCount || total > MAX_RETRO_LIBRARY_ENTRIES) return false;
    const last = this.#entries[this.#entries.length - 1];
    const first = page.entries[0];
    if (last !== undefined && first !== undefined && compareNativeLibraryEntries(last, first) >= 0) {
      return false;
    }
    if (page.nextCursor === undefined && total !== page.entryCount) return false;

    const from = this.#entries.length;
    this.#generation = page.libraryGeneration;
    this.#entryCount = page.entryCount;
    this.#entries.push(...page.entries);
    this.#nextCursor = page.nextCursor;
    this.#complete = page.nextCursor === undefined;
    this.#group(from);
    this.#clampWindow();
    return true;
  }

  /** Moves the selection by whole rows, stopping at the walked end. */
  moveBy(delta: number): RetroLibraryMove {
    const rowCount = this.rowCount;
    if (rowCount === 0) return { moved: false, needsMorePages: this.needsMorePages };
    const target = Math.min(Math.max(this.selectedIndex + delta, 0), rowCount - 1);
    return this.#selectRow(target);
  }

  /**
   * Moves to the neighbouring system.
   *
   * Forward, that is the first row of the next system. Backward, it is the
   * first row of the current system unless the selection already sits there,
   * in which case it is the first row of the previous system.
   */
  moveToSystem(direction: -1 | 1): RetroLibraryMove {
    const current = this.#groups[this.#selectedGroup];
    if (!current) return { moved: false, needsMorePages: this.needsMorePages };
    if (direction === 1) {
      for (let group = this.#selectedGroup + 1; group < this.#groups.length; group += 1) {
        if (this.#groups[group]?.systemId !== current.systemId) return this.#selectGroup(group);
      }
      // The next system, if there is one, is past the walked end.
      return { moved: false, needsMorePages: !this.#complete };
    }
    const start = this.#systemStartGroup(this.#selectedGroup);
    if (start !== this.#selectedGroup || this.#selectedVersion !== undefined) {
      return this.#selectGroup(start);
    }
    if (start === 0) return { moved: false, needsMorePages: this.needsMorePages };
    return this.#selectGroup(this.#systemStartGroup(start - 1));
  }

  /**
   * Moves to the first row of the selected system starting with `letter`.
   *
   * A letter no walked row starts with does not move the selection: the jump
   * addresses the entries the shell holds and nothing else.
   */
  jumpTo(letter: string): RetroLibraryMove {
    const stop = this.#letterStops().find((candidate) => candidate.letter === letter);
    if (!stop) return { moved: false, needsMorePages: this.needsMorePages };
    return this.#selectGroup(stop.group);
  }

  /**
   * Opens or closes the versions of the selected row.
   *
   * Returns false when the selected row is not a title with several staged
   * versions, so the caller can launch instead. Only one row is ever open, so
   * opening one closes another.
   */
  toggleSelectedVersions(): boolean {
    if (this.#selectedVersion !== undefined) return false;
    const group = this.#groups[this.#selectedGroup];
    if (!group || group.members.length < 2) return false;
    this.#openGroup = this.#openGroup === this.#selectedGroup ? undefined : this.#selectedGroup;
    this.#clampWindow();
    return true;
  }

  /**
   * Closes the open row, returning the selection to the row that opened it.
   */
  closeVersions(): boolean {
    if (this.#openGroup === undefined) return false;
    this.#selectedVersion = undefined;
    this.#openGroup = undefined;
    this.#clampWindow();
    return true;
  }

  /** Selects one already-walked row, for pointer selection. */
  select(index: number): RetroLibraryMove {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.rowCount) {
      return { moved: false, needsMorePages: this.needsMorePages };
    }
    return this.#selectRow(index);
  }

  /** Discards the walk so the next fetch starts from the first page. */
  reset(): void {
    this.#entries = [];
    this.#groups = [];
    this.#groupByKey = new Map();
    this.#openGroup = undefined;
    this.#generation = undefined;
    this.#entryCount = 0;
    this.#nextCursor = undefined;
    this.#complete = false;
    this.#selectedGroup = 0;
    this.#selectedVersion = undefined;
    this.#windowStart = 0;
    this.#letters = undefined;
  }

  /**
   * Files every entry from `from` under its title's base name.
   *
   * Versions are filed by system and base name rather than by adjacency,
   * because host order sorts `Title [!]` away from `Title (U)`. Each group
   * keeps the position of its first member, so the list stays in host order.
   */
  #group(from: number): void {
    for (let index = from; index < this.#entries.length; index += 1) {
      const entry = this.#entries[index];
      if (!entry) break;
      const base = retroLibraryBaseTitle(entry.title);
      const key = `${entry.systemId}\u0000${base}`;
      const ordinal = this.#groupByKey.get(key);
      const group = ordinal === undefined ? undefined : this.#groups[ordinal];
      if (group) {
        group.members.push(index);
        continue;
      }
      this.#groupByKey.set(key, this.#groups.length);
      this.#groups.push({ members: [index], systemId: entry.systemId, base });
    }
    this.#letters = undefined;
  }

  /** How many version rows the open group contributes. */
  #openVersions(): number {
    if (this.#openGroup === undefined) return 0;
    return this.#groups[this.#openGroup]?.members.length ?? 0;
  }

  /** The row that carries a group's own title. */
  #groupRow(ordinal: number): number {
    if (this.#openGroup === undefined || ordinal <= this.#openGroup) return ordinal;
    return ordinal + this.#openVersions();
  }

  /** Which group, and which version inside it, a row number names. */
  #locate(index: number): { group: number; version: number | undefined } | undefined {
    if (index < 0) return undefined;
    const open = this.#openGroup;
    if (open === undefined || index <= open) {
      return index < this.#groups.length ? { group: index, version: undefined } : undefined;
    }
    const versions = this.#openVersions();
    if (index <= open + versions) return { group: open, version: index - open - 1 };
    const group = index - versions;
    return group < this.#groups.length ? { group, version: undefined } : undefined;
  }

  #row(index: number): RetroLibraryRow | undefined {
    const at = this.#locate(index);
    if (!at) return undefined;
    const group = this.#groups[at.group];
    if (!group) return undefined;
    const systemStart = index > 0 ? this.#systemIdOfRow(index - 1) !== group.systemId : true;
    if (at.version !== undefined) {
      const entry = this.#entries[group.members[at.version] ?? -1];
      if (!entry) return undefined;
      return {
        kind: "entry",
        index,
        key: entry.entryId,
        systemId: group.systemId,
        systemStart: false,
        entry,
        version: true,
      };
    }
    const lead = this.#entries[group.members[0] ?? -1];
    if (!lead) return undefined;
    if (group.members.length === 1) {
      return {
        kind: "entry",
        index,
        key: lead.entryId,
        systemId: group.systemId,
        systemStart,
        entry: lead,
        version: false,
      };
    }
    return {
      kind: "group",
      index,
      // The group row is keyed by the entry that leads it, so a title never
      // becomes an identity.
      key: `versions-${lead.entryId}`,
      systemId: group.systemId,
      systemStart,
      title: group.base,
      versions: group.members.length,
      open: this.#openGroup === at.group,
    };
  }

  #systemIdOfRow(index: number): string | undefined {
    const at = this.#locate(index);
    return at === undefined ? undefined : this.#groups[at.group]?.systemId;
  }

  #selectRow(index: number): RetroLibraryMove {
    const at = this.#locate(index);
    if (!at) return { moved: false, needsMorePages: this.needsMorePages };
    const moved = index !== this.selectedIndex;
    this.#selectedGroup = at.group;
    this.#selectedVersion = at.version;
    this.#clampWindow();
    return { moved, needsMorePages: this.needsMorePages };
  }

  #selectGroup(ordinal: number): RetroLibraryMove {
    const target = this.#groupRow(ordinal);
    const moved = target !== this.selectedIndex;
    this.#selectedGroup = ordinal;
    this.#selectedVersion = undefined;
    this.#clampWindow();
    return { moved, needsMorePages: this.needsMorePages };
  }

  #systemStartGroup(from: number): number {
    const systemId = this.#groups[from]?.systemId;
    let ordinal = from;
    while (ordinal > 0 && this.#groups[ordinal - 1]?.systemId === systemId) ordinal -= 1;
    return ordinal;
  }

  /**
   * The first row of each letter in the selected system.
   *
   * Groups only ever gain members and are only ever appended, so the walked
   * group count and the system identify the answer, and it is held until one
   * of them changes rather than recomputed on every keypress of a
   * 100,000-entry library.
   */
  #letterStops(): readonly RetroLibraryLetterStop[] {
    const systemId = this.#groups[this.#selectedGroup]?.systemId;
    if (systemId === undefined) return [];
    const held = this.#letters;
    if (held && held.groups === this.#groups.length && held.systemId === systemId) {
      return held.stops;
    }
    const stops = new Map<string, number>();
    for (
      let ordinal = this.#systemStartGroup(this.#selectedGroup);
      ordinal < this.#groups.length;
      ordinal += 1
    ) {
      const group = this.#groups[ordinal];
      if (!group || group.systemId !== systemId) break;
      const letter = retroLibraryJumpLetter(group.base);
      if (!stops.has(letter)) stops.set(letter, ordinal);
    }
    const ordered = [...stops]
      .map(([letter, group]) => ({ letter, group }))
      .sort((left, right) => (left.letter < right.letter ? -1 : 1));
    this.#letters = { groups: this.#groups.length, systemId, stops: ordered };
    return ordered;
  }

  #clampWindow(): void {
    const last = Math.max(this.rowCount - this.#windowRows, 0);
    const selected = this.selectedIndex;
    let start = Math.min(this.#windowStart, last);
    if (selected < start) start = selected;
    if (selected >= start + this.#windowRows) start = selected - this.#windowRows + 1;
    this.#windowStart = Math.max(Math.min(start, last), 0);
  }
}

/**
 * The installed package that runs one library system.
 *
 * The library boundary publishes a system and a core per entry but no package
 * identity, and the package inventory publishes an ID, version, and runtime
 * but no library binding, so the shell has to name a package itself. It does
 * that by convention -- `<systemId>-library` -- and never decides anything by
 * it: the host resolves the name against its own signed catalog and refuses a
 * package that does not accept library content, or accepts it for another
 * system or core.
 */
export function libraryLaunchPackageId(systemId: string): string {
  return `${systemId}-library`;
}
