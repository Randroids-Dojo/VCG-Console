import {
  RETRO_OPERATOR_PROVISIONED_TRANSPORT,
  type RetroInstalledEntry,
  type RetroInstalledLibrary,
} from "../src";

export const HASH_A = "a".repeat(64);
export const HASH_B = "b".repeat(64);
export const HASH_C = "c".repeat(64);

export function installedEntry(
  hash: string,
  overrides: Partial<RetroInstalledEntry> = {},
): RetroInstalledEntry {
  return {
    entryId: `content-${hash}`,
    systemId: "game-boy",
    sha256: hash,
    sizeBytes: 2_048,
    extension: ".gb",
    title: "Tetris",
    coreId: "gambatte",
    controllerProfile: "retropad-standard-v1",
    provenance: {
      transport: "usb",
      importSessionId: `ris-${"9".repeat(32)}`,
      entitlementStatementVersion: "vcg-user-entitled-content-v1",
      importedAtMs: 900_000,
    },
    ...overrides,
  };
}

export function operatorProvisionedEntry(
  hash: string,
  overrides: Partial<RetroInstalledEntry> = {},
): RetroInstalledEntry {
  return installedEntry(hash, {
    provenance: { transport: RETRO_OPERATOR_PROVISIONED_TRANSPORT },
    ...overrides,
  });
}

export function libraryOf(
  ...entries: RetroInstalledEntry[]
): RetroInstalledLibrary {
  return { schemaVersion: 1, generation: 1, entries };
}
