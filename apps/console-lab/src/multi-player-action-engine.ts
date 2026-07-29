import type { MotionFrame, PlayerMotion } from "@vcg/motion-contract";
import { ActionEngine, type ActionChronologyFault, type ActionContext } from "./action-engine";

const CANDIDATE_SLOT_OFFSET = 3;
const STALE_CANDIDATE_FRAMES = 120;

interface PlayerEngine {
  engine: ActionEngine;
  lastSeenSequence: number;
}

/**
 * Keeps gesture baselines, latches, and chronology state isolated by persistent
 * track ID. A detected body remains a non-authoritative candidate until the
 * session controller explicitly assigns that track to player slot 1 or 2.
 */
export class MultiPlayerActionEngine {
  readonly #engines = new Map<string, PlayerEngine>();
  readonly #joinedSlots = new Map<string, 1 | 2>();

  enrich(frame: MotionFrame, context: ActionContext = "shell"): MotionFrame {
    const players = frame.players.map((player) => this.#enrichPlayer(frame, player, context));
    this.#discardStaleCandidates(frame.sequence);
    return {
      ...frame,
      capabilities: {
        ...frame.capabilities,
        profiles: [
          ...new Set([
            ...frame.capabilities.profiles,
            "actions.obstacle.v1" as const,
            "actions.shell.v1" as const,
          ]),
        ],
      },
      players: players
        .map((player, candidateIndex) => {
          const joinedSlot = this.#joinedSlots.get(player.id);
          return {
            ...player,
            sessionSlot: joinedSlot ?? CANDIDATE_SLOT_OFFSET + candidateIndex,
            state: joinedSlot ? "joined" as const : "candidate" as const,
          };
        })
        .sort((left, right) => {
          if (left.state !== right.state) return left.state === "joined" ? -1 : 1;
          return left.sessionSlot - right.sessionSlot;
        }),
    };
  }

  join(trackId: string, slot: 1 | 2): void {
    for (const [joinedTrackId, joinedSlot] of this.#joinedSlots) {
      if (joinedSlot === slot && joinedTrackId !== trackId) this.leave(joinedTrackId);
    }
    const playerEngine = this.#engines.get(trackId);
    if (playerEngine) playerEngine.engine.join();
    this.#joinedSlots.set(trackId, slot);
  }

  leave(trackId: string): void {
    this.#joinedSlots.delete(trackId);
    this.#engines.get(trackId)?.engine.leave();
  }

  synchronize(players: ReadonlyArray<{ trackId: string; slot: 1 | 2 }>): void {
    const authoritativeTracks = new Set(players.map((player) => player.trackId));
    for (const trackId of this.#joinedSlots.keys()) {
      if (!authoritativeTracks.has(trackId)) this.leave(trackId);
    }
    for (const player of players) this.join(player.trackId, player.slot);
  }

  suspend(): void {
    for (const { engine } of this.#engines.values()) engine.suspend();
  }

  reset(): void {
    for (const { engine } of this.#engines.values()) engine.reset();
    this.#engines.clear();
    this.#joinedSlots.clear();
  }

  get chronologyFault(): ActionChronologyFault | undefined {
    for (const [trackId, { engine }] of this.#engines) {
      if (this.#joinedSlots.has(trackId) && engine.chronologyFault) return engine.chronologyFault;
    }
    return undefined;
  }

  #enrichPlayer(frame: MotionFrame, player: PlayerMotion, context: ActionContext): PlayerMotion {
    let playerEngine = this.#engines.get(player.id);
    if (!playerEngine) {
      playerEngine = { engine: new ActionEngine(), lastSeenSequence: frame.sequence };
      this.#engines.set(player.id, playerEngine);
      if (this.#joinedSlots.has(player.id)) playerEngine.engine.join();
    }
    playerEngine.lastSeenSequence = frame.sequence;
    const enriched = playerEngine.engine.enrich({ ...frame, players: [player] }, context).players[0];
    return enriched ?? { ...player, actions: [] };
  }

  #discardStaleCandidates(sequence: number): void {
    for (const [trackId, playerEngine] of this.#engines) {
      if (
        !this.#joinedSlots.has(trackId)
        && sequence - playerEngine.lastSeenSequence > STALE_CANDIDATE_FRAMES
      ) {
        this.#engines.delete(trackId);
      }
    }
  }
}
