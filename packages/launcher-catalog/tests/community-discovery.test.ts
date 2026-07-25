import { describe, expect, it } from "vitest";
import {
  CommunityDiscoveryError,
  FamilyCommunityDiscoveryController,
  MAX_COMMUNITY_DISCOVERY_BYTES,
  projectFamilyCommunityDiscovery,
  verifyCommunityDiscoveryFeed,
  type CommunityDiscoveryFeed,
} from "../src/index";

const encoder = new TextEncoder();

function feed(): CommunityDiscoveryFeed {
  return {
    format: "vcg-community-discovery/v1",
    schemaVersion: 1,
    audience: "family-community",
    keyId: "community-catalog-2026",
    catalogGeneration: 42,
    entries: [
      {
        admissionId: "admission.alpha.v1",
        gameId: "alpha-adventure",
        version: "1.0.0",
        manifestSha256: "a".repeat(64),
        trustTier: "curated-community",
        admissionState: "approved",
        runtime: "local-web",
        delivery: "installed",
        title: "Alpha Adventure",
        publisher: "Example Studio",
        summary: "A reviewed local cooperative puzzle.",
        network: "offline",
        inputProfiles: ["gamepad", "motion.obstacle.v1"],
        serviceBoundary: "none",
        reportRouteId: "community-report.alpha",
        removalPolicy: "user-choice",
        emergencyReason: "none",
        launchBindingId: "catalog.alpha.1",
      },
      {
        admissionId: "admission.bravo.v2",
        gameId: "bravo-disabled",
        version: "2.0.0",
        manifestSha256: "b".repeat(64),
        trustTier: "curated-community",
        admissionState: "temporarily-disabled",
        runtime: "remote-web",
        delivery: "hosted",
        title: "Bravo",
        publisher: "Community Workshop",
        summary: "Temporarily unavailable during a service review.",
        network: "required",
        inputProfiles: ["gamepad"],
        serviceBoundary: "required-account",
        reportRouteId: "community-report.bravo",
        removalPolicy: "no-local-data",
        emergencyReason: "service-incident",
        launchBindingId: null,
      },
      {
        admissionId: "admission.charlie.v1",
        gameId: "charlie-candidate",
        version: "1.0.0",
        manifestSha256: "c".repeat(64),
        trustTier: "curated-community",
        admissionState: "candidate",
        runtime: "native",
        delivery: "installed",
        title: "Charlie Candidate",
        publisher: "Candidate Studio",
        summary: "Still under review.",
        network: "optional",
        inputProfiles: ["gamepad"],
        serviceBoundary: "optional-account",
        reportRouteId: "community-report.charlie",
        removalPolicy: "preserve-local-data",
        emergencyReason: "none",
        launchBindingId: null,
      },
      {
        admissionId: "admission.delta.v3",
        gameId: "delta-revoked",
        version: "3.0.0",
        manifestSha256: "d".repeat(64),
        trustTier: "curated-community",
        admissionState: "revoked",
        runtime: "libretro",
        delivery: "installed",
        title: "Delta",
        publisher: "Former Publisher",
        summary: "Historical revoked record.",
        network: "offline",
        inputProfiles: ["gamepad"],
        serviceBoundary: "none",
        reportRouteId: "community-report.delta",
        removalPolicy: "preserve-local-data",
        emergencyReason: "rights",
        launchBindingId: null,
      },
      {
        admissionId: "admission.echo.v1",
        gameId: "echo-removed",
        version: "1.0.0",
        manifestSha256: "e".repeat(64),
        trustTier: "curated-community",
        admissionState: "removed",
        runtime: "local-web",
        delivery: "installed",
        title: "Echo",
        publisher: "Archived Studio",
        summary: "Historical removed record.",
        network: "offline",
        inputProfiles: ["gamepad"],
        serviceBoundary: "none",
        reportRouteId: "community-report.echo",
        removalPolicy: "no-local-data",
        emergencyReason: "none",
        launchBindingId: null,
      },
    ],
  };
}

function canonical(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value)}\n`);
}

async function verified(
  value = feed(),
  generation = value.catalogGeneration,
) {
  const exactBytes = canonical(value);
  return verifyCommunityDiscoveryFeed(
    exactBytes,
    Uint8Array.of(7),
    generation,
    ({ bytes, signature, format, audience, keyId, catalogGeneration }) =>
      new TextDecoder().decode(bytes) === new TextDecoder().decode(exactBytes)
      && signature.length === 1
      && signature[0] === 7
      && format === "vcg-community-discovery/v1"
      && audience === "family-community"
      && keyId === value.keyId
      && catalogGeneration === value.catalogGeneration,
  );
}

function multiEntryFeed(generation = 42): CommunityDiscoveryFeed {
  const value = structuredClone(feed());
  value.catalogGeneration = generation;
  const bravo = value.entries[1]!;
  bravo.admissionState = "approved";
  bravo.emergencyReason = "none";
  bravo.launchBindingId = "catalog.bravo.2";
  return value;
}

async function projected(value = feed()) {
  return projectFamilyCommunityDiscovery(await verified(value));
}

async function verifySchemaMutation(
  mutate: (value: Record<string, any>) => void,
) {
  const value = structuredClone(feed()) as unknown as Record<string, any>;
  mutate(value);
  return verifyCommunityDiscoveryFeed(
    canonical(value),
    Uint8Array.of(1),
    42,
    () => true,
  );
}

describe("verified community discovery", () => {
  it("projects only active approved reviewed entries", async () => {
    const projection = projectFamilyCommunityDiscovery(await verified());

    expect(projection.surface).toBe("family-community");
    expect(projection.catalogGeneration).toBe(42);
    expect(projection.entries.map((entry) => entry.gameId)).toEqual([
      "alpha-adventure",
    ]);
    expect(projection.entries[0]).toMatchObject({
      trustLabel: "Community reviewed",
      runtimeLabel: "Local web",
      deliveryLabel: "Installed locally",
      networkLabel: "Offline",
      inputLabels: ["Controller", "Body motion"],
      serviceLabel: "No account",
      availability: "available",
      unavailableReason: null,
      launchAction: {
        kind: "request-host-launch",
        admissionId: "admission.alpha.v1",
        launchBindingId: "catalog.alpha.1",
      },
      installAction: "none",
      reportAction: {
        kind: "report-by-id",
        reportRouteId: "community-report.alpha",
      },
      removalNotice: "Removal asks before local-data deletion",
    });
    expect(projection.entries.some((entry) => entry.gameId === "bravo-disabled")).toBe(false);
  });

  it("exposes no URL, navigation, manifest, signature, or install authority", async () => {
    const projection = projectFamilyCommunityDiscovery(await verified());
    const serialized = JSON.stringify(projection);

    expect(serialized).not.toMatch(/https?:|www\.|entrypoint|origin|manifest|signature|href/u);
    expect(projection.entries.every((entry) => entry.installAction === "none")).toBe(true);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.entries)).toBe(true);
    expect(Object.isFrozen(projection.entries[0])).toBe(true);
  });

  it("cannot promote developer or modified content through a valid-looking record", async () => {
    await expect(
      verifySchemaMutation((value) => {
        value.entries[0].trustTier = "developer-session";
      }),
    ).rejects.toThrow(/closed schema/u);

    const original = feed();
    const originalBytes = canonical(original);
    const modified = structuredClone(original);
    modified.entries[0]!.title = "Unapproved Developer Build";
    await expect(
      verifyCommunityDiscoveryFeed(
        canonical(modified),
        Uint8Array.of(7),
        42,
        ({ bytes }) =>
          new TextDecoder().decode(bytes)
          === new TextDecoder().decode(originalBytes),
      ),
    ).rejects.toThrow(/signature verification failed/u);

    const projection = projectFamilyCommunityDiscovery(await verified());
    expect(projection.entries.some((entry) => entry.gameId === "charlie-candidate")).toBe(false);
  });

  it("requires the exact current generation and detached signature", async () => {
    await expect(verified(feed(), 41)).rejects.toThrow(
      /generation is stale or unexpected/u,
    );
    await expect(
      verifyCommunityDiscoveryFeed(
        canonical(feed()),
        Uint8Array.of(9),
        42,
        () => false,
      ),
    ).rejects.toThrow(/signature verification failed/u);
    await expect(
      verifyCommunityDiscoveryFeed(
        canonical(feed()),
        Uint8Array.of(9),
        42,
        () => {
          throw new Error("secret verifier path and key material");
        },
      ),
    ).rejects.toEqual(
      new CommunityDiscoveryError(
        "community discovery signature verification failed",
      ),
    );
  });

  it("rejects clones and plain objects after verification", async () => {
    const exact = await verified();
    expect(() =>
      projectFamilyCommunityDiscovery(structuredClone(exact)),
    ).toThrow(/exact verified feed/u);
    expect(() =>
      projectFamilyCommunityDiscovery(feed() as any),
    ).toThrow(/exact verified feed/u);
  });

  it("requires bounded canonical UTF-8 JSON with a closed schema", async () => {
    const pretty = encoder.encode(`${JSON.stringify(feed(), null, 2)}\n`);
    await expect(
      verifyCommunityDiscoveryFeed(pretty, Uint8Array.of(1), 42, () => true),
    ).rejects.toThrow(/canonical JSON/u);

    const duplicateKey = encoder.encode(
      '{"format":"vcg-community-discovery/v1","schemaVersion":1,"schemaVersion":1,"audience":"family-community","keyId":"community-catalog-2026","catalogGeneration":42,"entries":[]}\n',
    );
    await expect(
      verifyCommunityDiscoveryFeed(
        duplicateKey,
        Uint8Array.of(1),
        42,
        () => true,
      ),
    ).rejects.toThrow(/canonical JSON/u);
    await expect(
      verifyCommunityDiscoveryFeed(
        Uint8Array.of(0xff),
        Uint8Array.of(1),
        42,
        () => true,
      ),
    ).rejects.toThrow(/valid UTF-8/u);
    await expect(
      verifyCommunityDiscoveryFeed(
        new Uint8Array(MAX_COMMUNITY_DISCOVERY_BYTES + 1),
        Uint8Array.of(1),
        42,
        () => true,
      ),
    ).rejects.toThrow(/byte size/u);
    await expect(
      verifySchemaMutation((value) => {
        value.browserUrl = "https://untrusted.example";
      }),
    ).rejects.toThrow(/closed schema/u);
  });

  it("rejects duplicate, reordered, and unsafe identity or text data", async () => {
    await expect(
      verifySchemaMutation((value) => {
        value.entries[1].gameId = value.entries[0].gameId;
      }),
    ).rejects.toThrow(/closed schema/u);
    await expect(
      verifySchemaMutation((value) => {
        value.entries.reverse();
      }),
    ).rejects.toThrow(/closed schema/u);
    await expect(
      verifySchemaMutation((value) => {
        value.entries[0].inputProfiles = [
          "motion.obstacle.v1",
          "gamepad",
        ];
      }),
    ).rejects.toThrow(/closed schema/u);
    for (const unsafeText of [
      "Open https://untrusted.example",
      "Trusted\u202Eelpmaxe.live",
      "Hidden\u200Bseparator",
      "Next\u2028line",
      "C1\u0085control",
    ]) {
      await expect(
        verifySchemaMutation((value) => {
          value.entries[0].summary = unsafeText;
        }),
      ).rejects.toThrow(/closed schema/u);
    }
  });

  it("enforces launch, disable, hosted-data, and removal semantics", async () => {
    await expect(
      verifySchemaMutation((value) => {
        value.entries[0].launchBindingId = null;
      }),
    ).rejects.toThrow(/closed schema/u);
    await expect(
      verifySchemaMutation((value) => {
        value.entries[1].launchBindingId = "catalog.bravo.2";
      }),
    ).rejects.toThrow(/closed schema/u);
    await expect(
      verifySchemaMutation((value) => {
        value.entries[1].emergencyReason = "none";
      }),
    ).rejects.toThrow(/closed schema/u);
    await expect(
      verifySchemaMutation((value) => {
        value.entries[1].removalPolicy = "preserve-local-data";
      }),
    ).rejects.toThrow(/closed schema/u);
    await expect(
      verifySchemaMutation((value) => {
        value.entries[0].delivery = "hosted";
        value.entries[0].removalPolicy = "no-local-data";
      }),
    ).rejects.toThrow(/closed schema/u);
    await expect(
      verifySchemaMutation((value) => {
        value.entries[1].delivery = "installed";
      }),
    ).rejects.toThrow(/closed schema/u);
    await expect(
      verifySchemaMutation((value) => {
        value.entries[1].network = "offline";
      }),
    ).rejects.toThrow(/closed schema/u);
    await expect(
      verifySchemaMutation((value) => {
        value.entries[2].network = "offline";
      }),
    ).rejects.toThrow(/closed schema/u);

    const projection = projectFamilyCommunityDiscovery(await verified());
    expect(projection.entries.some((entry) => entry.gameId === "bravo-disabled")).toBe(false);
  });
});

describe("family community discovery controller", () => {
  it("provides bounded browse, detail, Back, and Home navigation", async () => {
    const controller = new FamilyCommunityDiscoveryController(
      await projected(multiEntryFeed()),
    );

    expect(controller.view()).toMatchObject({
      kind: "browse",
      catalogGeneration: 42,
      focusedIndex: 0,
      focusedGameId: "alpha-adventure",
    });
    expect(controller.navigate("previous").view).toMatchObject({
      kind: "browse",
      focusedIndex: 0,
    });
    expect(controller.navigate("next").view).toMatchObject({
      kind: "browse",
      focusedIndex: 1,
      focusedGameId: "bravo-disabled",
    });
    expect(controller.navigate("next").view).toMatchObject({
      kind: "browse",
      focusedIndex: 1,
    });
    expect(controller.navigate("select")).toMatchObject({
      disposition: "handled",
      view: {
        kind: "detail",
        entry: {
          gameId: "bravo-disabled",
          trustLabel: "Community reviewed",
          availability: "available",
        },
      },
    });
    expect(controller.navigate("previous").view.kind).toBe("detail");
    expect(controller.navigate("back")).toMatchObject({
      disposition: "handled",
      view: {
        kind: "browse",
        focusedGameId: "bravo-disabled",
      },
    });
    expect(controller.navigate("back").disposition).toBe("exit-community");
    expect(controller.navigate("select").view.kind).toBe("detail");
    expect(controller.navigate("home")).toMatchObject({
      disposition: "home",
      view: {
        kind: "browse",
        focusedGameId: "bravo-disabled",
      },
    });
  });

  it("dispatches only an exact current one-shot launch or report intent", async () => {
    const projection = await projected(multiEntryFeed());
    const controller = new FamilyCommunityDiscoveryController(projection);
    const other = new FamilyCommunityDiscoveryController(projection);
    controller.navigate("select");
    other.navigate("select");

    const launch = controller.planIntent("launch");
    expect(launch).toEqual({
      kind: "launch",
      catalogGeneration: 42,
      gameId: "alpha-adventure",
      version: "1.0.0",
      admissionId: "admission.alpha.v1",
      launchBindingId: "catalog.alpha.1",
    });
    expect(() =>
      controller.dispatchIntent(structuredClone(launch), () => undefined),
    ).toThrow(/not issued by this controller/u);
    expect(() =>
      other.dispatchIntent(launch, () => undefined),
    ).toThrow(/not issued by this controller/u);

    let reentrantError: unknown;
    const dispatched = controller.dispatchIntent(launch, (action) => {
      try {
        controller.dispatchIntent(launch, () => undefined);
      } catch (error) {
        reentrantError = error;
      }
      return action;
    });
    expect(dispatched).toEqual({
      kind: "request-host-launch",
      admissionId: "admission.alpha.v1",
      launchBindingId: "catalog.alpha.1",
    });
    expect(reentrantError).toEqual(
      new CommunityDiscoveryError(
        "community discovery intent was not issued by this controller",
      ),
    );
    expect(() =>
      controller.dispatchIntent(launch, () => undefined),
    ).toThrow(/not issued by this controller/u);

    const superseded = controller.planIntent("launch");
    const report = controller.planIntent("report");
    expect(() =>
      controller.dispatchIntent(superseded, () => undefined),
    ).toThrow(/not issued by this controller/u);
    expect(
      controller.dispatchIntent(report, (action) => action),
    ).toEqual({
      kind: "report-by-id",
      reportRouteId: "community-report.alpha",
    });
  });

  it("invalidates intents on navigation and monotonic feed replacement", async () => {
    const controller = new FamilyCommunityDiscoveryController(
      await projected(multiEntryFeed()),
    );
    controller.navigate("select");
    const navigatedAway = controller.planIntent("launch");
    controller.navigate("back");
    expect(() =>
      controller.dispatchIntent(navigatedAway, () => undefined),
    ).toThrow(/not issued by this controller/u);
    expect(() => controller.planIntent("launch")).toThrow(
      /require the current detail/u,
    );

    controller.navigate("select");
    const disabledByRefresh = controller.planIntent("launch");
    const replacement = multiEntryFeed(43);
    replacement.entries[0]!.admissionState = "temporarily-disabled";
    replacement.entries[0]!.emergencyReason = "safety";
    replacement.entries[0]!.launchBindingId = null;
    expect(
      controller.replaceProjection(await projected(replacement)),
    ).toMatchObject({
      kind: "browse",
      catalogGeneration: 43,
      focusedGameId: "bravo-disabled",
    });
    expect(() =>
      controller.dispatchIntent(disabledByRefresh, () => undefined),
    ).toThrow(/not issued by this controller/u);

    const sameGeneration = await projected(multiEntryFeed(43));
    const rollback = await projected(multiEntryFeed(42));
    expect(() =>
      controller.replaceProjection(sameGeneration),
    ).toThrow(/generation must advance/u);
    expect(() =>
      controller.replaceProjection(rollback),
    ).toThrow(/generation must advance/u);
  });

  it("rejects forged projections, commands, intent kinds, and dispatchers", async () => {
    const projection = await projected();
    expect(
      () =>
        new FamilyCommunityDiscoveryController(
          structuredClone(projection),
        ),
    ).toThrow(/exact family projection/u);

    const controller = new FamilyCommunityDiscoveryController(projection);
    expect(() =>
      controller.navigate("open-url" as any),
    ).toThrow(/navigation command is invalid/u);
    controller.navigate("select");
    expect(() =>
      controller.planIntent("install" as any),
    ).toThrow(/intent kind is invalid/u);
    const launch = controller.planIntent("launch");
    expect(() =>
      controller.dispatchIntent(launch, null as any),
    ).toThrow(/dispatcher is invalid/u);
  });

  it("keeps empty discovery deterministic and browser-authority free", async () => {
    const empty = feed();
    empty.entries = [];
    const controller = new FamilyCommunityDiscoveryController(
      await projected(empty),
    );
    expect(controller.view()).toEqual({
      kind: "browse",
      catalogGeneration: 42,
      entries: [],
      focusedIndex: null,
      focusedGameId: null,
    });
    expect(controller.navigate("select").view.kind).toBe("browse");
    expect(controller.navigate("back").disposition).toBe("exit-community");
    expect(() => controller.planIntent("report")).toThrow(
      /require the current detail/u,
    );

    const populated = new FamilyCommunityDiscoveryController(
      await projected(multiEntryFeed()),
    );
    populated.navigate("select");
    const serialized = JSON.stringify({
      view: populated.view(),
      launch: populated.planIntent("launch"),
    });
    expect(serialized).not.toMatch(
      /https?:|www\.|entrypoint|origin|manifest|signature|package(?:Path|Url|Action)/u,
    );
    expect(serialized).toContain('"installAction":"none"');
    expect(Object.isFrozen(populated.view())).toBe(true);
  });
});
