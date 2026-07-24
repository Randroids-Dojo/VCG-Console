const MAX_HOSTED_BROWSER_DESTINATIONS = 64;
const MAX_DESTINATION_ID_LENGTH = 64;
const MAX_ENTRYPOINT_LENGTH = 2_048;
const DESTINATION_FIELDS = Object.freeze(["entrypoint", "id"]);

export interface HostedBrowserPreviewPlan {
  readonly schemaVersion: 1;
  readonly destinationId: string;
  readonly entrypoint: string;
  readonly disclosure: "unsupervised-browser-preview";
}

export interface HostedBrowserPreviewResult {
  readonly opened: boolean;
  readonly code: "PREVIEW_OPENED" | "PREVIEW_BLOCKED";
}

export type HostedBrowserWindowOpener = (
  entrypoint: string,
  target: "_blank",
  features: "noopener,noreferrer",
) => { opener: unknown } | null;

interface HostedBrowserDestination {
  readonly id: string;
  readonly entrypoint: string;
}

export class HostedBrowserPreviewError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "HostedBrowserPreviewError";
  }
}

/**
 * Browser-only preview authority for the generated launcher catalog.
 *
 * This never claims process, profile, navigation, crash, input, or compositor
 * supervision. It only prevents the trusted launcher flow from substituting a
 * destination after one exact catalog-bound preview has been prepared.
 */
export class HostedBrowserPreviewController {
  readonly #destinations = new Map<string, HostedBrowserDestination>();
  #issuedPlan: HostedBrowserPreviewPlan | undefined;

  public constructor(input: unknown) {
    if (
      !Array.isArray(input)
      || input.length === 0
      || input.length > MAX_HOSTED_BROWSER_DESTINATIONS
    ) {
      throw new HostedBrowserPreviewError(
        "hosted browser destinations must be a non-empty bounded array",
      );
    }
    const entrypoints = new Set<string>();
    for (const value of input) {
      const destination = validateDestination(value);
      if (this.#destinations.has(destination.id)) {
        throw new HostedBrowserPreviewError(
          "hosted browser destination IDs must be unique",
        );
      }
      if (entrypoints.has(destination.entrypoint)) {
        throw new HostedBrowserPreviewError(
          "hosted browser entrypoints must be unique",
        );
      }
      this.#destinations.set(destination.id, destination);
      entrypoints.add(destination.entrypoint);
    }
  }

  public prepare(destinationId: string): HostedBrowserPreviewPlan {
    requireDestinationId(destinationId);
    const destination = this.#destinations.get(destinationId);
    if (destination === undefined) {
      throw new HostedBrowserPreviewError(
        "hosted browser destination is not allowlisted",
      );
    }
    const plan = Object.freeze({
      schemaVersion: 1 as const,
      destinationId: destination.id,
      entrypoint: destination.entrypoint,
      disclosure: "unsupervised-browser-preview" as const,
    });
    this.#issuedPlan = plan;
    return plan;
  }

  public open(
    plan: HostedBrowserPreviewPlan,
    opener: HostedBrowserWindowOpener,
  ): HostedBrowserPreviewResult {
    if (this.#issuedPlan !== plan) {
      throw new HostedBrowserPreviewError(
        "hosted browser preview was not issued by this controller",
      );
    }
    this.#issuedPlan = undefined;
    let opened: { opener: unknown } | null;
    try {
      opened = opener(plan.entrypoint, "_blank", "noopener,noreferrer");
    } catch {
      return Object.freeze({
        opened: false,
        code: "PREVIEW_BLOCKED",
      });
    }
    if (opened === null) {
      return Object.freeze({
        opened: false,
        code: "PREVIEW_BLOCKED",
      });
    }
    try {
      opened.opener = null;
    } catch {
      // The requested `noopener,noreferrer` feature remains authoritative.
      // Some WindowProxy implementations do not permit the redundant setter.
    }
    return Object.freeze({
      opened: true,
      code: "PREVIEW_OPENED",
    });
  }

  public discard(plan: HostedBrowserPreviewPlan): void {
    if (this.#issuedPlan !== plan) {
      throw new HostedBrowserPreviewError(
        "hosted browser preview was not issued by this controller",
      );
    }
    this.#issuedPlan = undefined;
  }
}

function validateDestination(value: unknown): HostedBrowserDestination {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    throw new HostedBrowserPreviewError(
      "hosted browser destination must be an object",
    );
  }
  const source = value as Record<string, unknown>;
  const fields = Object.keys(source).sort();
  if (
    fields.length !== DESTINATION_FIELDS.length
    || fields.some((field, index) => field !== DESTINATION_FIELDS[index])
  ) {
    throw new HostedBrowserPreviewError(
      "hosted browser destination has unknown or missing fields",
    );
  }
  requireDestinationId(source.id);
  if (
    typeof source.entrypoint !== "string"
    || source.entrypoint.length === 0
    || source.entrypoint.length > MAX_ENTRYPOINT_LENGTH
  ) {
    throw new HostedBrowserPreviewError(
      "hosted browser entrypoint is invalid",
    );
  }
  let url: URL;
  try {
    url = new URL(source.entrypoint);
  } catch {
    throw new HostedBrowserPreviewError(
      "hosted browser entrypoint is invalid",
    );
  }
  if (
    url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.origin !== source.entrypoint
  ) {
    throw new HostedBrowserPreviewError(
      "hosted browser entrypoint must be a credential-free HTTPS origin",
    );
  }
  return Object.freeze({
    id: source.id,
    entrypoint: source.entrypoint,
  });
}

function requireDestinationId(value: unknown): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > MAX_DESTINATION_ID_LENGTH
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  ) {
    throw new HostedBrowserPreviewError(
      "hosted browser destination ID is invalid",
    );
  }
}
