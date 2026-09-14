export type ExclusionArtifactKind =
  | "backup" | "cloud-sync" | "developer" | "diagnostics" | "export"
  | "factory-reset" | "game-storage" | "recovery-image" | "support-bundle" | "system-slot";

export interface ExclusionManifest {
  readonly schemaVersion: 1;
  readonly scanId: string;
  readonly artifacts: readonly {
    readonly id: string;
    readonly kind: ExclusionArtifactKind;
    readonly materializedPath: string;
  }[];
  readonly canaries: readonly { readonly id: string; readonly value: string }[];
  readonly forbiddenPathSegments: readonly { readonly id: string; readonly value: string }[];
  readonly forbiddenFileDigests: readonly { readonly id: string; readonly sha256: string }[];
  readonly limits: Readonly<{
    maxEntries: number;
    maxFiles: number;
    maxFileBytes: number;
    maxFindings: number;
    maxTotalBytes: number;
  }>;
}

export interface ExclusionScanReport {
  readonly schemaVersion: 1;
  readonly scanId: string;
  readonly status: "passed" | "failed";
  readonly complete: boolean;
  readonly artifacts: readonly {
    readonly id: string;
    readonly kind: ExclusionArtifactKind;
    readonly entries: number;
    readonly files: number;
    readonly bytes: number;
    readonly contentTreeSha256: string;
  }[];
  readonly totals: Readonly<{ entries: number; files: number; bytes: number }>;
  readonly findings: readonly {
    readonly artifactId: string;
    readonly entryOrdinal: number;
    readonly location: "path" | "content" | "file-digest";
    readonly signalId: string;
    readonly signalKind: "canary" | "forbidden-path-segment" | "forbidden-file-digest";
    readonly encoding: string;
  }[];
  readonly findingsTruncated: boolean;
}

export class ExclusionScanError extends Error {
  constructor(code: string);
  readonly code: string;
}

export function validateExclusionManifest(input: unknown): ExclusionManifest;
export function scanExclusionManifest(input: unknown, manifestDirectory: string): Promise<ExclusionScanReport>;
export function scanExclusionManifestFile(manifestPath: string): Promise<ExclusionScanReport>;
