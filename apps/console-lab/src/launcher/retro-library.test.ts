import { describe, expect, it } from "vitest";
import {
  compareNativeLibraryEntries,
  type NativeLibraryEntry,
  type NativeLibraryPage,
} from "../native-host-client";
import {
  libraryLaunchPackageId,
  retroLibraryBaseTitle,
  retroLibraryJumpLetter,
  RETRO_LIBRARY_MAX_WINDOW_ROWS,
  RETRO_LIBRARY_MIN_WINDOW_ROWS,
  RETRO_LIBRARY_WINDOW_ROWS,
  RetroLibraryBrowse,
  type RetroLibraryRow,
} from "./retro-library";

const CURSOR = "b".repeat(32);

function entry(systemId: string, index: number): NativeLibraryEntry {
  return {
    entryId: `content-${index.toString(16).padStart(64, "0")}`,
    title: `${systemId} title ${String(index).padStart(4, "0")}`,
    systemId,
    coreId: "mesen",
    sizeBytes: 40_976,
  };
}

function page(
  entries: NativeLibraryEntry[],
  entryCount: number,
  nextCursor?: string,
): NativeLibraryPage {
  return {
    protocolVersion: "0.1.0",
    libraryGeneration: 2,
    entryCount,
    entries,
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}

/** One system's worth of entries, in the order the host returns them. */
function run(systemId: string, from: number, count: number): NativeLibraryEntry[] {
  return Array.from({ length: count }, (_, offset) => entry(systemId, from + offset));
}

/** Named entries, put into the order the host publishes them. */
function staged(...titles: Array<[string, string]>): NativeLibraryEntry[] {
  return titles
    .map(([systemId, title], index) => ({
      entryId: `content-${(index + 1).toString(16).padStart(64, "0")}`,
      title,
      systemId,
      coreId: "mesen",
      sizeBytes: 40_976 + index,
    }))
    .sort(compareNativeLibraryEntries);
}

function collection(...titles: Array<[string, string]>): RetroLibraryBrowse {
  const browse = new RetroLibraryBrowse();
  const entries = staged(...titles);
  expect(browse.accept(page(entries, entries.length))).toBe(true);
  return browse;
}

/** The row at one index, reached the way the view reaches it. */
function rowAt(browse: RetroLibraryBrowse, index: number): RetroLibraryRow {
  browse.select(index);
  const row = browse.rows.find((candidate) => candidate.index === index);
  if (!row) throw new Error(`no row at ${index}`);
  return row;
}

function walked(...systems: Array<[string, number]>): RetroLibraryBrowse {
  const browse = new RetroLibraryBrowse();
  let next = 1;
  const entries = systems.flatMap(([systemId, count]) => {
    const built = run(systemId, next, count);
    next += count;
    return built;
  });
  expect(browse.accept(page(entries, entries.length))).toBe(true);
  return browse;
}

describe("retro library walk", () => {
  it("continues one forward walk of one snapshot", () => {
    const browse = new RetroLibraryBrowse();
    expect(browse.needsMorePages).toBe(true);
    expect(browse.started).toBe(false);

    expect(browse.accept(page(run("nes", 1, 2), 4, CURSOR))).toBe(true);
    expect(browse.started).toBe(true);
    expect(browse.nextCursor).toBe(CURSOR);
    expect(browse.complete).toBe(false);
    expect(browse.needsMorePages).toBe(true);

    expect(browse.accept(page(run("nes", 3, 2), 4))).toBe(true);
    expect(browse.loadedCount).toBe(4);
    expect(browse.entryCount).toBe(4);
    expect(browse.complete).toBe(true);
    expect(browse.needsMorePages).toBe(false);
    expect(browse.nextCursor).toBeUndefined();
  });

  it("refuses a page that does not continue the same walk", () => {
    const rejected = (build: (browse: RetroLibraryBrowse) => NativeLibraryPage) => {
      const browse = new RetroLibraryBrowse();
      expect(browse.accept(page(run("nes", 1, 2), 6, CURSOR))).toBe(true);
      expect(browse.accept(build(browse))).toBe(false);
      expect(browse.loadedCount).toBe(2);
    };

    rejected(() => ({ ...page(run("nes", 3, 2), 6), libraryGeneration: 3 }));
    rejected(() => page(run("nes", 3, 2), 7));
    // The first entry of the next page must sort after the last one held.
    rejected(() => page(run("nes", 1, 2), 6));
    // A final page has to account for every entry the library declares.
    rejected(() => page(run("nes", 3, 2), 6));
    // A page may never carry more entries than the library declares.
    rejected(() => page(run("nes", 3, 5), 6, CURSOR));
  });

  it("refuses a second first page and any page after the walk finished", () => {
    const browse = new RetroLibraryBrowse();
    expect(browse.accept(page(run("nes", 1, 2), 2))).toBe(true);
    expect(browse.accept(page(run("nes", 3, 2), 4))).toBe(false);
    expect(browse.loadedCount).toBe(2);
  });

  it("starts a fresh walk after a reset", () => {
    const browse = walked(["nes", 3]);
    browse.moveBy(2);
    browse.reset();
    expect(browse.loadedCount).toBe(0);
    expect(browse.entryCount).toBe(0);
    expect(browse.selectedIndex).toBe(0);
    expect(browse.started).toBe(false);
    expect(browse.needsMorePages).toBe(true);
    expect(browse.accept(page(run("snes", 1, 1), 1))).toBe(true);
  });
});

describe("retro library window", () => {
  it("mounts at most one window of rows however large the library is", () => {
    const browse = walked(["nes", 500]);
    expect(browse.loadedCount).toBe(500);
    expect(browse.rows).toHaveLength(RETRO_LIBRARY_WINDOW_ROWS);

    browse.moveBy(499);
    expect(browse.rows).toHaveLength(RETRO_LIBRARY_WINDOW_ROWS);
    expect(browse.rows.at(-1)?.index).toBe(499);
  });

  it("holds the window still until the selection reaches its edge", () => {
    const browse = walked(["nes", 40]);
    expect(browse.windowStart).toBe(0);

    browse.moveBy(RETRO_LIBRARY_WINDOW_ROWS - 1);
    expect(browse.windowStart).toBe(0);

    browse.moveBy(1);
    expect(browse.windowStart).toBe(1);
    expect(browse.rows[0]?.index).toBe(1);

    browse.moveBy(-1);
    expect(browse.windowStart).toBe(1);
    expect(browse.selectedIndex).toBe(RETRO_LIBRARY_WINDOW_ROWS - 1);

    browse.moveBy(-(RETRO_LIBRARY_WINDOW_ROWS - 1));
    expect(browse.selectedIndex).toBe(0);
    expect(browse.windowStart).toBe(0);
  });

  it("stops at both ends rather than wrapping", () => {
    const browse = walked(["nes", 5]);
    expect(browse.moveBy(-1)).toEqual({ moved: false, needsMorePages: false });
    expect(browse.selectedIndex).toBe(0);

    expect(browse.moveBy(9).moved).toBe(true);
    expect(browse.selectedIndex).toBe(4);
    expect(browse.moveBy(1)).toEqual({ moved: false, needsMorePages: false });
  });

  it("marks the row that opens each system", () => {
    const browse = walked(["nes", 2], ["snes", 2]);
    expect(browse.rows.map((row) => [row.index, row.systemStart])).toEqual([
      [0, true],
      [1, false],
      [2, true],
      [3, false],
    ]);
  });

  it("mounts the number of rows the view measured, within bounds", () => {
    const browse = walked(["nes", 100]);
    expect(browse.windowRows).toBe(RETRO_LIBRARY_WINDOW_ROWS);

    expect(browse.setWindowRows(4)).toBe(true);
    expect(browse.rows).toHaveLength(4);
    expect(browse.setWindowRows(4)).toBe(false);

    expect(browse.setWindowRows(4.9)).toBe(false);
    expect(browse.setWindowRows(0)).toBe(true);
    expect(browse.windowRows).toBe(RETRO_LIBRARY_MIN_WINDOW_ROWS);
    expect(browse.setWindowRows(1_000)).toBe(true);
    expect(browse.windowRows).toBe(RETRO_LIBRARY_MAX_WINDOW_ROWS);
    expect(browse.setWindowRows(Number.NaN)).toBe(false);
    expect(browse.windowRows).toBe(RETRO_LIBRARY_MAX_WINDOW_ROWS);
  });

  it("keeps the selection inside a window that shrank", () => {
    const browse = walked(["nes", 40]);
    browse.setWindowRows(10);
    browse.moveBy(9);
    expect(browse.windowStart).toBe(0);
    expect(browse.rows.at(-1)?.index).toBe(9);

    browse.setWindowRows(4);
    expect(browse.selectedIndex).toBe(9);
    expect(browse.rows.map((row) => row.index)).toEqual([6, 7, 8, 9]);
  });

  it("reports an unwalked library as needing pages before it can move", () => {
    const browse = new RetroLibraryBrowse();
    expect(browse.rows).toEqual([]);
    expect(browse.selected).toBeUndefined();
    expect(browse.moveBy(1)).toEqual({ moved: false, needsMorePages: true });
    expect(browse.moveToSystem(1)).toEqual({ moved: false, needsMorePages: true });
  });
});

describe("retro library system navigation", () => {
  it("moves forward to the first entry of the next system", () => {
    const browse = walked(["nes", 3], ["snes", 3], ["genesis", 2]);
    expect(browse.moveToSystem(1)).toEqual({ moved: true, needsMorePages: false });
    expect(browse.selectedIndex).toBe(3);
    expect(browse.selected?.systemId).toBe("snes");

    expect(browse.moveToSystem(1).moved).toBe(true);
    expect(browse.selectedIndex).toBe(6);
    expect(browse.moveToSystem(1)).toEqual({ moved: false, needsMorePages: false });
  });

  it("moves backward to the start of the current system before leaving it", () => {
    const browse = walked(["nes", 3], ["snes", 3]);
    browse.moveBy(5);
    expect(browse.selectedIndex).toBe(5);

    expect(browse.moveToSystem(-1).moved).toBe(true);
    expect(browse.selectedIndex).toBe(3);

    expect(browse.moveToSystem(-1).moved).toBe(true);
    expect(browse.selectedIndex).toBe(0);
    expect(browse.moveToSystem(-1)).toEqual({ moved: false, needsMorePages: false });
  });

  it("reports that the next system may lie past the walked end", () => {
    const browse = new RetroLibraryBrowse();
    expect(browse.accept(page(run("nes", 1, 3), 6, CURSOR))).toBe(true);
    expect(browse.moveToSystem(1)).toEqual({ moved: false, needsMorePages: true });

    expect(browse.accept(page(run("snes", 4, 3), 6))).toBe(true);
    expect(browse.moveToSystem(1)).toEqual({ moved: true, needsMorePages: false });
    expect(browse.selectedIndex).toBe(3);
  });
});

describe("retro library selection", () => {
  it("selects only rows the walk has reached", () => {
    const browse = walked(["nes", 4]);
    expect(browse.select(2).moved).toBe(true);
    expect(browse.selectedIndex).toBe(2);
    expect(browse.select(4)).toEqual({ moved: false, needsMorePages: false });
    expect(browse.select(-1)).toEqual({ moved: false, needsMorePages: false });
    expect(browse.select(1.5)).toEqual({ moved: false, needsMorePages: false });
    expect(browse.selectedIndex).toBe(2);
  });

  it("names the installed package one library system launches through", () => {
    expect(libraryLaunchPackageId("nes")).toBe("nes-library");
    expect(libraryLaunchPackageId("genesis-plus")).toBe("genesis-plus-library");
  });
});

describe("retro library version grouping", () => {
  it("removes only trailing parenthetical and bracketed markers", () => {
    expect(retroLibraryBaseTitle("Super Mario Bros. (U)")).toBe("Super Mario Bros.");
    expect(retroLibraryBaseTitle("Super Mario Bros. (E) [!]")).toBe("Super Mario Bros.");
    expect(retroLibraryBaseTitle("Super Mario World 2 - Yoshi's Island (USA) (Rev 1)")).toBe(
      "Super Mario World 2 - Yoshi's Island",
    );
    expect(retroLibraryBaseTitle("Blaster Master [b1]")).toBe("Blaster Master");
    expect(retroLibraryBaseTitle("Metal Gear")).toBe("Metal Gear");
    // A marker that is not trailing is part of the name as staged.
    expect(retroLibraryBaseTitle("Kid Icarus (U) hack")).toBe("Kid Icarus (U) hack");
    expect(retroLibraryBaseTitle("Adventure Island [b1")).toBe("Adventure Island [b1");
    // A title that is nothing but a marker keeps its own text, so unrelated
    // entries never collapse into one empty group.
    expect(retroLibraryBaseTitle("(U)")).toBe("(U)");
    expect(retroLibraryBaseTitle("[!]")).toBe("[!]");
  });

  it("renders one row for the versions of one title", () => {
    const browse = collection(
      ["nes", "Super Mario Bros. (E)"],
      ["nes", "Super Mario Bros. (U) [!]"],
    );
    expect(browse.rowCount).toBe(1);
    const row = rowAt(browse, 0);
    expect(row.kind).toBe("group");
    if (row.kind !== "group") return;
    expect(row.title).toBe("Super Mario Bros.");
    expect(row.versions).toBe(2);
    expect(row.open).toBe(false);
    // Entry IDs key the list; a title never does.
    expect(row.key).toContain(browse.entries[0]?.entryId ?? "");
    // A row standing for two staged files has no single game to launch.
    expect(browse.selected).toBeUndefined();
  });

  it("renders a title with one staged file as an ordinary row", () => {
    const browse = collection(["nes", "Metal Gear (U)"], ["nes", "Zelda II (U)"]);
    expect(browse.rowCount).toBe(2);
    const row = rowAt(browse, 0);
    expect(row.kind).toBe("entry");
    if (row.kind !== "entry") return;
    // The staged title is shown exactly, markers and all.
    expect(row.entry.title).toBe("Metal Gear (U)");
    expect(row.key).toBe(row.entry.entryId);
    expect(browse.selected).toBe(row.entry);
    expect(browse.toggleSelectedVersions()).toBe(false);
  });

  it("groups by base name and system rather than by resemblance", () => {
    const browse = collection(
      ["nes", "Contra (U)"],
      ["nes", "Contra Force (U)"],
      ["snes", "Contra (U)"],
      ["snes", "Contra III - The Alien Wars (U)"],
    );
    // Four base names across two systems, so nothing groups.
    expect(browse.rowCount).toBe(4);
    for (let index = 0; index < browse.rowCount; index += 1) {
      expect(rowAt(browse, index).kind).toBe("entry");
    }
  });

  it("opens a title to its staged versions and closes it again", () => {
    const browse = collection(
      ["nes", "Mega Man 2 (E)"],
      ["nes", "Mega Man 2 (U)"],
      ["nes", "Mega Man 3 (U)"],
    );
    expect(browse.rowCount).toBe(2);
    expect(browse.select(0).moved).toBe(false);
    expect(browse.toggleSelectedVersions()).toBe(true);
    expect(browse.rowCount).toBe(4);

    const first = rowAt(browse, 1);
    const second = rowAt(browse, 2);
    expect(first.kind === "entry" && first.entry.title).toBe("Mega Man 2 (E)");
    expect(second.kind === "entry" && second.entry.title).toBe("Mega Man 2 (U)");
    expect(second.kind === "entry" && second.version).toBe(true);
    expect(browse.selected?.title).toBe("Mega Man 2 (U)");
    // The row below the open title is still the next title.
    const after = rowAt(browse, 3);
    expect(after.kind === "entry" && after.entry.title).toBe("Mega Man 3 (U)");

    // Back closes the open title and returns to the row that opened it.
    browse.select(2);
    expect(browse.closeVersions()).toBe(true);
    expect(browse.selectedIndex).toBe(0);
    expect(browse.rowCount).toBe(2);
    expect(browse.closeVersions()).toBe(false);
  });

  it("opens only one title at a time", () => {
    const browse = collection(
      ["nes", "Contra (E)"],
      ["nes", "Contra (U)"],
      ["nes", "Double Dragon (E)"],
      ["nes", "Double Dragon (U)"],
    );
    expect(browse.rowCount).toBe(2);
    browse.select(0);
    expect(browse.toggleSelectedVersions()).toBe(true);
    expect(browse.rowCount).toBe(4);

    browse.select(3);
    expect(browse.toggleSelectedVersions()).toBe(true);
    expect(browse.rowCount).toBe(4);
    expect(browse.selectedIndex).toBe(1);
    expect(rowAt(browse, 0).kind).toBe("group");
  });

  it("groups versions the host order separates", () => {
    const browse = collection(
      ["nes", "Zelda (U)"],
      ["nes", "Zelda 2 (U)"],
      ["nes", "Zelda [!]"],
    );
    expect(browse.entries.map((held) => held.title)).toEqual([
      "Zelda (U)",
      "Zelda 2 (U)",
      "Zelda [!]",
    ]);
    expect(browse.rowCount).toBe(2);
    const grouped = rowAt(browse, 0);
    expect(grouped.kind === "group" && grouped.versions).toBe(2);
    const between = rowAt(browse, 1);
    expect(between.kind === "entry" && between.entry.title).toBe("Zelda 2 (U)");
  });

  it("keeps every staged entry reachable", () => {
    const browse = collection(
      ["nes", "Balloon Fight (U)"],
      ["nes", "Super Mario Bros. (E)"],
      ["nes", "Super Mario Bros. (U)"],
      ["nes", "Super Mario Bros. (U) [!]"],
      ["nes", "Super Mario Bros. 2 (U)"],
      ["snes", "Super Mario World (E)"],
      ["snes", "Super Mario World (U)"],
    );
    const reachable = new Set<string>();
    let index = 0;
    while (index < browse.rowCount) {
      const row = rowAt(browse, index);
      if (row.kind === "entry") {
        reachable.add(row.entry.entryId);
        index += 1;
        continue;
      }
      expect(browse.toggleSelectedVersions()).toBe(true);
      for (let offset = 1; offset <= row.versions; offset += 1) {
        const version = rowAt(browse, index + offset);
        expect(version.kind).toBe("entry");
        if (version.kind === "entry") reachable.add(version.entry.entryId);
      }
      expect(browse.closeVersions()).toBe(true);
      index += 1;
    }
    expect([...reachable].sort()).toEqual(browse.entries.map((held) => held.entryId).sort());
    expect(reachable.size).toBe(7);
  });

  it("groups the versions a later page completes", () => {
    const browse = new RetroLibraryBrowse();
    const entries = staged(["nes", "Castlevania (E)"], ["nes", "Castlevania (U)"]);
    expect(browse.accept(page(entries.slice(0, 1), 2, CURSOR))).toBe(true);
    expect(rowAt(browse, 0).kind).toBe("entry");

    expect(browse.accept(page(entries.slice(1), 2))).toBe(true);
    expect(browse.rowCount).toBe(1);
    const row = rowAt(browse, 0);
    expect(row.kind === "group" && row.versions).toBe(2);
  });
});

describe("retro library letter jump", () => {
  it("offers only the letters walked rows of the selected system start with", () => {
    const browse = collection(
      ["nes", "1942 (U)"],
      ["nes", "Contra (E)"],
      ["nes", "Contra (U)"],
      ["nes", "Metal Gear (U)"],
      ["snes", "Aladdin (U)"],
    );
    expect(browse.jumpLetters).toEqual(["#", "C", "M"]);
    expect(browse.selectedLetter).toBe("#");

    expect(browse.jumpTo("M")).toEqual({ moved: true, needsMorePages: false });
    expect(browse.selectedIndex).toBe(2);
    expect(browse.selectedLetter).toBe("M");

    // The letters follow the system, because one letter names one run of rows
    // inside a system and many runs across the library.
    expect(browse.moveToSystem(1).moved).toBe(true);
    expect(browse.jumpLetters).toEqual(["A"]);
  });

  it("lands on the row that stands for the versions of a title", () => {
    const browse = collection(
      ["nes", "Balloon Fight (U)"],
      ["nes", "Contra (E)"],
      ["nes", "Contra (U)"],
    );
    expect(browse.jumpTo("C").moved).toBe(true);
    const row = rowAt(browse, browse.selectedIndex);
    expect(row.kind === "group" && row.title).toBe("Contra");
  });

  it("does not move for a letter no walked row starts with", () => {
    const browse = collection(["nes", "Contra (U)"], ["nes", "Metal Gear (U)"]);
    expect(browse.jumpLetters).not.toContain("Z");
    expect(browse.jumpTo("Z")).toEqual({ moved: false, needsMorePages: false });
    expect(browse.jumpTo("c")).toEqual({ moved: false, needsMorePages: false });
    expect(browse.jumpTo("")).toEqual({ moved: false, needsMorePages: false });
    expect(browse.selectedIndex).toBe(0);
  });

  it("offers no letters before the walk has read anything", () => {
    const browse = new RetroLibraryBrowse();
    expect(browse.jumpLetters).toEqual([]);
    expect(browse.selectedLetter).toBeUndefined();
    expect(browse.jumpTo("A")).toEqual({ moved: false, needsMorePages: true });
  });

  it("addresses only what the unfinished walk holds", () => {
    const browse = new RetroLibraryBrowse();
    const entries = staged(
      ["nes", "Contra (U)"],
      ["nes", "Metal Gear (U)"],
      ["nes", "Zelda II (U)"],
    );
    expect(browse.accept(page(entries.slice(0, 2), 3, CURSOR))).toBe(true);
    expect(browse.complete).toBe(false);
    expect(browse.jumpLetters).toEqual(["C", "M"]);
    expect(browse.jumpTo("Z")).toEqual({ moved: false, needsMorePages: true });
    expect(browse.selectedIndex).toBe(0);

    expect(browse.accept(page(entries.slice(2), 3))).toBe(true);
    expect(browse.jumpLetters).toEqual(["C", "M", "Z"]);
    expect(browse.jumpTo("Z")).toEqual({ moved: true, needsMorePages: false });
    expect(browse.selectedIndex).toBe(2);
  });

  it("folds a title's first character to one letter", () => {
    expect(retroLibraryJumpLetter("Contra (U)")).toBe("C");
    expect(retroLibraryJumpLetter("contra (U)")).toBe("C");
    expect(retroLibraryJumpLetter("1942 (U)")).toBe("#");
    expect(retroLibraryJumpLetter("  Metal Gear")).toBe("M");
    expect(retroLibraryJumpLetter("Okosystem")).toBe("O");
    expect(retroLibraryJumpLetter("")).toBe("#");
  });
});
