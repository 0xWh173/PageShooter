import crypto from "node:crypto";
import {
  type RoomParticipant,
  type PublicRoomState,
  type RoomChatMessage,
  type RoomEmojiEvent,
  type RoomLastRollInfo,
  type RoomLastShotInfo,
  type MatchState,
  type MatchEvent,
  type CellValue,
  type UserActiveRoomResolution,
  GameRuleError,
  WAITING_ROOM_TTL_MS,
  COMPLETED_ROOM_TTL_MS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  CELL_PROGRESS_LABELS,
  ALLOWED_EMOJI_IDS,
  CHAT_COOLDOWN_MS,
  CHAT_MUTE_DURATION_MS,
  EMOJI_WINDOW_MS,
  EMOJI_MAX_PER_WINDOW
} from "@pageshooter/shared";
import {
  createInitialMatchState,
  applyRoll,
  applyShot,
  eliminatePlayer,
  pauseMatch,
  getNextHostPlayerId,
  type CommandOptions,
  type CreatePlayerInput
} from "@pageshooter/game-engine";
import { generateRoomCode, normalizeRoomCode, isValidRoomCode } from "./roomCode.js";
import {
  generateSecretSeed,
  computeCommitment,
  deriveRollFromSeed,
  type CommitmentDetails,
  type PublicCommitment,
  type RevealedRoll
} from "../game/commitment.js";

export class RoomError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "RoomError";
  }
}

export interface DisconnectRecord {
  deadline: number;
  timer: NodeJS.Timeout;
}

export interface EphemeralRoom {
  roomId: string;
  roomCode: string;
  hostUserId: string;
  phase: "WAITING" | "ACTIVE" | "PAUSED" | "COMPLETED";
  players: Map<string, RoomParticipant>;
  spectators: Map<string, RoomParticipant>;
  matchState: MatchState | null;
  currentTurnCommitment: CommitmentDetails | null;
  createdAt: number;
  expiresAt: number | null; // Invariant 10-minute deadline for WAITING and COMPLETED; null during ACTIVE
  temporaryReport: object | null;
  nextJoinSequence: number;
  disconnectedPlayers: Map<string, DisconnectRecord>;
  recentChats: RoomChatMessage[];
  recentEmojis: RoomEmojiEvent[];
  lastRoll: RoomLastRollInfo | null;
  lastShot: RoomLastShotInfo | null;
  httpChatRate: Map<string, { lastChatAt: number; mutedUntil: number }>;
  httpEmojiRate: Map<string, number[]>;
}

const MAX_RECENT_CHATS = 50;
const MAX_RECENT_EMOJIS = 30;
const EMOJI_BUFFER_TTL_MS = 10_000;

export interface UserSummary {
  id: string;
  username: string;
  avatarId: string;
}

export function sanitizeRoom(room: EphemeralRoom): PublicRoomState {
  const now = Date.now();
  const players = Array.from(room.players.values()).sort((a, b) => a.joinSequence - b.joinSequence);
  const spectators = Array.from(room.spectators.values()).sort((a, b) => a.joinSequence - b.joinSequence);
  const activeEmojis = room.recentEmojis.filter((e) => now - e.timestamp <= EMOJI_BUFFER_TTL_MS);

  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    hostUserId: room.hostUserId,
    phase: room.phase,
    players,
    spectators,
    playerCount: players.length,
    spectatorCount: spectators.length,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    match: room.matchState,
    currentCommitment: room.currentTurnCommitment
      ? {
          turnNumber: room.currentTurnCommitment.turnNumber,
          commitmentHash: room.currentTurnCommitment.commitmentHash
        }
      : null,
    recentChats: room.recentChats.slice(-MAX_RECENT_CHATS),
    recentEmojis: activeEmojis,
    lastRoll: room.lastRoll,
    lastShot: room.lastShot
  };
}

export class RoomManager {
  private roomsById = new Map<string, EphemeralRoom>();
  private roomsByCode = new Map<string, EphemeralRoom>();
  private readonly maxActiveRooms: number;

  constructor(options?: { maxActiveRooms?: number }) {
    this.maxActiveRooms = options?.maxActiveRooms ?? 20;
  }

  get roomCount(): number {
    return this.roomsById.size;
  }

  get maxCapacity(): number {
    return this.maxActiveRooms;
  }

  createRoom(hostUser: UserSummary, customCode?: string): EphemeralRoom {
    const now = Date.now();
    this.sweepExpiredRooms(now);

    if (this.roomsById.size >= this.maxActiveRooms) {
      throw new RoomError(
        503,
        "SERVER_CAPACITY_REACHED",
        "Server is currently at maximum active room capacity. Please try again shortly."
      );
    }

    let roomCode = customCode ? normalizeRoomCode(customCode) : generateRoomCode();

    if (customCode && !isValidRoomCode(customCode)) {
      throw new RoomError(400, "INVALID_ROOM_CODE", "Room code must be exactly 6 valid Base-32 characters");
    }

    // Ensure collision safety by re-rolling if code collides
    let attempts = 0;
    while (this.roomsByCode.has(roomCode)) {
      attempts++;
      if (attempts > 20) {
        throw new RoomError(500, "CODE_GENERATION_FAILED", "Unable to allocate unique room code");
      }
      roomCode = generateRoomCode();
    }

    const roomId = crypto.randomUUID();

    const hostParticipant: RoomParticipant = {
      userId: hostUser.id,
      username: hostUser.username,
      avatarId: hostUser.avatarId || "barnaby",
      role: "HOST",
      connected: true,
      socketId: null,
      joinSequence: 1,
      joinedAt: now
    };

    const room: EphemeralRoom = {
      roomId,
      roomCode,
      hostUserId: hostUser.id,
      phase: "WAITING",
      players: new Map([[hostUser.id, hostParticipant]]),
      spectators: new Map(),
      matchState: null,
      currentTurnCommitment: null,
      createdAt: now,
      expiresAt: now + WAITING_ROOM_TTL_MS,
      temporaryReport: null,
      nextJoinSequence: 2,
      disconnectedPlayers: new Map(),
      recentChats: [],
      recentEmojis: [],
      lastRoll: null,
      lastShot: null,
      httpChatRate: new Map(),
      httpEmojiRate: new Map()
    };

    this.roomsById.set(roomId, room);
    this.roomsByCode.set(roomCode, room);

    return room;
  }

  getRoomByCode(rawCode: string, now: number = Date.now()): EphemeralRoom | null {
    const code = normalizeRoomCode(rawCode);
    const room = this.roomsByCode.get(code);
    if (!room) return null;

    if (this.isExpired(room, now)) {
      this.deleteRoom(room);
      return null;
    }
    return room;
  }

  getRoomById(roomId: string, now: number = Date.now()): EphemeralRoom | null {
    const room = this.roomsById.get(roomId);
    if (!room) return null;

    if (this.isExpired(room, now)) {
      this.deleteRoom(room);
      return null;
    }
    return room;
  }

  joinAsPlayer(rawCode: string, user: UserSummary): { room: EphemeralRoom; participant: RoomParticipant } {
    const room = this.getRoomByCode(rawCode);
    if (!room) {
      throw new RoomError(404, "ROOM_NOT_FOUND", "Room not found or has expired");
    }

    if (room.phase !== "WAITING") {
      throw new RoomError(400, "ROOM_NOT_WAITING", "Cannot join match as player once game has started");
    }

    // If user is currently a spectator, remove them from spectators
    if (room.spectators.has(user.id)) {
      room.spectators.delete(user.id);
    }

    // If user is already an active player in room, return existing participant
    const existing = room.players.get(user.id);
    if (existing) {
      existing.connected = true;
      existing.username = user.username;
      existing.avatarId = user.avatarId;
      return { room, participant: existing };
    }

    // Check maximum capacity
    if (room.players.size >= MAX_PLAYERS) {
      throw new RoomError(400, "ROOM_FULL", `Room is full. Maximum capacity is ${MAX_PLAYERS} players.`);
    }

    const participant: RoomParticipant = {
      userId: user.id,
      username: user.username,
      avatarId: user.avatarId || "barnaby",
      role: "PLAYER",
      connected: true,
      socketId: null,
      joinSequence: room.nextJoinSequence++,
      joinedAt: Date.now()
    };

    room.players.set(user.id, participant);
    return { room, participant };
  }

  joinAsSpectator(rawCode: string, user: UserSummary): { room: EphemeralRoom; participant: RoomParticipant } {
    const room = this.getRoomByCode(rawCode);
    if (!room) {
      throw new RoomError(404, "ROOM_NOT_FOUND", "Room not found or has expired");
    }

    if (room.players.has(user.id)) {
      throw new RoomError(400, "ALREADY_PLAYER", "Active players cannot join as spectators simultaneously");
    }

    const existing = room.spectators.get(user.id);
    if (existing) {
      existing.connected = true;
      existing.username = user.username;
      existing.avatarId = user.avatarId;
      return { room, participant: existing };
    }

    const participant: RoomParticipant = {
      userId: user.id,
      username: user.username,
      avatarId: user.avatarId || "barnaby",
      role: "SPECTATOR",
      connected: true,
      socketId: null,
      joinSequence: room.nextJoinSequence++,
      joinedAt: Date.now()
    };

    room.spectators.set(user.id, participant);
    return { room, participant };
  }

  kickPlayer(rawCode: string, requesterUserId: string, targetUserId: string): { kicked: RoomParticipant } {
    const room = this.getRoomByCode(rawCode);
    if (!room) {
      throw new RoomError(404, "ROOM_NOT_FOUND", "Room not found or has expired");
    }

    if (room.hostUserId !== requesterUserId) {
      throw new RoomError(403, "NOT_HOST", "Only the room host can kick participants");
    }

    if (room.phase !== "WAITING") {
      throw new RoomError(400, "ROOM_NOT_WAITING", "Cannot kick participants after match has started");
    }

    if (targetUserId === room.hostUserId) {
      throw new RoomError(400, "CANNOT_KICK_HOST", "Host cannot kick themselves from room");
    }

    const playerTarget = room.players.get(targetUserId);
    if (playerTarget) {
      room.players.delete(targetUserId);
      return { kicked: playerTarget };
    }

    const spectatorTarget = room.spectators.get(targetUserId);
    if (spectatorTarget) {
      room.spectators.delete(targetUserId);
      return { kicked: spectatorTarget };
    }

    throw new RoomError(404, "PARTICIPANT_NOT_FOUND", "Participant not found in this room");
  }

  /**
   * Phase 6.7 Milestone 1.1: Six-State Room Participation Resolution
   * Resolves the user's active participation state across all RAM rooms.
   * Enforces strict role precedence and single recoverable room invariant.
   */
  resolveUserRoomParticipation(userId: string): UserActiveRoomResolution | null {
    interface Candidate {
      resolution: UserActiveRoomResolution;
      tier: number;
    }

    const candidates: Candidate[] = [];

    for (const room of this.roomsById.values()) {
      // 1. Check players map
      const player = room.players.get(userId);
      if (player) {
        if (room.phase === "ACTIVE" || room.phase === "PAUSED") {
          // Check if eliminated
          const matchPlayer = room.matchState?.players.find((p) => p.playerId === userId);
          const isEliminated = matchPlayer?.status === "ELIMINATED";

          if (isEliminated) {
            candidates.push({
              tier: 5,
              resolution: {
                roomId: room.roomId,
                roomCode: room.roomCode,
                phase: room.phase,
                participation: "ELIMINATED",
                role: "SPECTATOR",
                canReconnectMatch: false,
                hasActiveMatchParticipation: false
              }
            });
          } else if (room.disconnectedPlayers.has(userId) || !player.connected) {
            const record = room.disconnectedPlayers.get(userId);
            const remainingMs = record ? Math.max(0, record.deadline - Date.now()) : 0;
            candidates.push({
              tier: 1,
              resolution: {
                roomId: room.roomId,
                roomCode: room.roomCode,
                phase: room.phase,
                participation: "DISCONNECTED_PLAYER",
                role: player.role,
                canReconnectMatch: true,
                hasActiveMatchParticipation: true,
                reconnectDeadlineMs: remainingMs
              }
            });
          } else {
            // Connected active player (e.g. from another tab)
            candidates.push({
              tier: 2,
              resolution: {
                roomId: room.roomId,
                roomCode: room.roomCode,
                phase: room.phase,
                participation: "CONNECTED_PLAYER",
                role: player.role,
                canReconnectMatch: false,
                hasActiveMatchParticipation: true
              }
            });
          }
        } else if (room.phase === "WAITING") {
          candidates.push({
            tier: 3,
            resolution: {
              roomId: room.roomId,
              roomCode: room.roomCode,
              phase: "WAITING",
              participation: "WAITING_PLAYER",
              role: player.role,
              canReconnectMatch: false,
              hasActiveMatchParticipation: false
            }
          });
        } else if (room.phase === "COMPLETED") {
          candidates.push({
            tier: 6,
            resolution: {
              roomId: room.roomId,
              roomCode: room.roomCode,
              phase: "COMPLETED",
              participation: "COMPLETED_PARTICIPANT",
              role: player.role,
              canReconnectMatch: false,
              hasActiveMatchParticipation: false
            }
          });
        }
        continue;
      }

      // 2. Check spectators map
      const spectator = room.spectators.get(userId);
      if (spectator) {
        if (room.phase === "COMPLETED") {
          candidates.push({
            tier: 6,
            resolution: {
              roomId: room.roomId,
              roomCode: room.roomCode,
              phase: "COMPLETED",
              participation: "COMPLETED_PARTICIPANT",
              role: "SPECTATOR",
              canReconnectMatch: false,
              hasActiveMatchParticipation: false
            }
          });
        } else {
          candidates.push({
            tier: 4,
            resolution: {
              roomId: room.roomId,
              roomCode: room.roomCode,
              phase: room.phase,
              participation: "SPECTATOR",
              role: "SPECTATOR",
              canReconnectMatch: false,
              hasActiveMatchParticipation: false
            }
          });
        }
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sort by tier ascending (1 is highest priority), tie-break lexicographically by roomId
    candidates.sort((a, b) => {
      if (a.tier !== b.tier) {
        return a.tier - b.tier;
      }
      return a.resolution.roomId.localeCompare(b.resolution.roomId);
    });

    return candidates[0].resolution;
  }

  leaveRoom(rawCode: string, userId: string): { roomDeleted: boolean; newHostUserId?: string } {
    const room = this.getRoomByCode(rawCode);
    if (!room) {
      return { roomDeleted: true };
    }

    // 1. Check if user is a spectator
    if (room.spectators.has(userId)) {
      room.spectators.delete(userId);
      if (room.players.size === 0 && room.spectators.size === 0) {
        this.deleteRoom(room);
        return { roomDeleted: true };
      }
      return { roomDeleted: false };
    }

    // 2. Check if user is a player
    if (!room.players.has(userId)) {
      return { roomDeleted: false };
    }

    room.players.delete(userId);

    // If room has no remaining players, tear down room immediately
    if (room.players.size === 0) {
      this.deleteRoom(room);
      return { roomDeleted: true };
    }

    // ADR-02 Option B: If departing user was host in WAITING phase, migrate to earliest joinSequence
    if (room.hostUserId === userId && room.phase === "WAITING") {
      const remainingPlayers = Array.from(room.players.values()).sort(
        (a, b) => a.joinSequence - b.joinSequence
      );
      const newHost = remainingPlayers[0];
      newHost.role = "HOST";
      room.hostUserId = newHost.userId;

      return {
        roomDeleted: false,
        newHostUserId: newHost.userId
      };
    }

    return { roomDeleted: false };
  }

  startMatch(
    rawCode: string,
    requesterUserId: string
  ): {
    room: EphemeralRoom;
    matchState: MatchState;
    events: MatchEvent[];
    commitment: PublicCommitment;
  } {
    const room = this.getRoomByCode(rawCode);
    if (!room) {
      throw new RoomError(404, "ROOM_NOT_FOUND", "Room not found or has expired");
    }

    if (room.phase !== "WAITING") {
      throw new RoomError(400, "MATCH_ALREADY_STARTED", "Cannot start match: room is not in WAITING phase");
    }

    if (room.hostUserId !== requesterUserId) {
      throw new RoomError(403, "NOT_HOST", "Only the room host can start the match");
    }

    if (room.players.size < MIN_PLAYERS) {
      throw new RoomError(
        400,
        "NOT_ENOUGH_PLAYERS",
        `Match requires at least ${MIN_PLAYERS} active players to start. Current: ${room.players.size}`
      );
    }

    if (room.players.size > MAX_PLAYERS) {
      throw new RoomError(
        400,
        "ROOM_FULL",
        `Match supports at most ${MAX_PLAYERS} active players. Current: ${room.players.size}`
      );
    }

    const playerInputs: CreatePlayerInput[] = Array.from(room.players.values()).map((p) => ({
      playerId: p.userId,
      username: p.username,
      avatarId: p.avatarId
    }));

    const matchId = crypto.randomUUID();
    const initialEngineResult = createInitialMatchState(matchId, room.roomId, playerInputs);

    room.phase = "ACTIVE";
    room.expiresAt = null; // Invariant: active matches have null expiresAt (never expire by timer)
    room.matchState = initialEngineResult.state;

    // Generate cryptographic commitment for Turn 1 (Phase 6.5 Commitment-Reveal Protocol)
    const turn1Seed = generateSecretSeed();
    const turn1CommitmentHash = computeCommitment(turn1Seed, matchId, 1);
    room.currentTurnCommitment = {
      turnNumber: 1,
      seed: turn1Seed,
      commitmentHash: turn1CommitmentHash
    };

    return {
      room,
      matchState: room.matchState,
      events: initialEngineResult.events,
      commitment: {
        turnNumber: 1,
        commitmentHash: turn1CommitmentHash
      }
    };
  }

  executeRoll(
    rawCode: string,
    callerUserId: string,
    options?: CommandOptions
  ): {
    roomCode: string;
    state: MatchState;
    events: MatchEvent[];
    rollResult: RevealedRoll;
    lastRoll: RoomLastRollInfo;
    nextCommitment: PublicCommitment | null;
  } {
    const room = this.getRoomByCode(rawCode);
    if (!room) {
      throw new RoomError(404, "ROOM_NOT_FOUND", "Room not found or has expired");
    }

    if (room.phase !== "ACTIVE" || !room.matchState) {
      throw new RoomError(400, "MATCH_NOT_ACTIVE", "Cannot roll: match is not active");
    }

    if (room.spectators.has(callerUserId)) {
      throw new RoomError(403, "SPECTATOR_FORBIDDEN", "Spectators have zero gameplay authority");
    }

    if (!room.players.has(callerUserId)) {
      throw new RoomError(403, "NOT_A_PLAYER", "Caller is not an active player in this match");
    }

    if (room.matchState.turn.currentPlayerId !== callerUserId) {
      throw new RoomError(400, "NOT_YOUR_TURN", "It is not your turn to roll");
    }

    if (room.matchState.turn.phase !== "AWAITING_ROLL") {
      throw new RoomError(400, "INVALID_COMMAND", `Cannot roll when turn phase is ${room.matchState.turn.phase}`);
    }

    if (!room.currentTurnCommitment) {
      throw new RoomError(500, "COMMITMENT_MISSING", "No active commitment found for this turn");
    }

    const { turnNumber, seed, commitmentHash } = room.currentTurnCommitment;
    const { outcome, pageNumber } = deriveRollFromSeed(seed, room.matchState.matchId, turnNumber);

    const preRollPlayer = room.matchState.players.find((p) => p.playerId === callerUserId);
    const actorUsername = preRollPlayer?.username ?? room.players.get(callerUserId)?.username ?? "Scribe";
    const preRollCell = preRollPlayer?.cells[outcome];

    let consequenceText: string;
    if (preRollCell?.destroyed) {
      consequenceText = `💨 ${actorUsername} rolled Cell #${outcome} — already poofed! Turn passes!`;
    } else if (preRollCell && preRollCell.progress < 5) {
      const nextStage = (preRollCell.progress + 1) as 1 | 2 | 3 | 4 | 5;
      const stageLabel = CELL_PROGRESS_LABELS[nextStage];
      consequenceText =
        nextStage === 5
          ? `🔫 ${actorUsername} completed Cell #${outcome} (${stageLabel})! Ready next roll!`
          : `✏️ ${actorUsername} drew ${stageLabel} on Cell #${outcome}!`;
    } else {
      consequenceText = `🎯 ${actorUsername} armed Cell #${outcome}! Pick an opponent to shoot!`;
    }

    let engineResult;
    try {
      engineResult = applyRoll(room.matchState, callerUserId, outcome, pageNumber, options);
    } catch (err) {
      if (err instanceof GameRuleError) {
        const statusCode = err.code === "STALE_STATE" || err.code === "DUPLICATE_COMMAND" ? 409 : 400;
        throw new RoomError(statusCode, err.code, err.message);
      }
      throw err;
    }

    room.matchState = engineResult.state;

    const lastRoll: RoomLastRollInfo = {
      turnNumber,
      actorPlayerId: callerUserId,
      actorUsername,
      outcome,
      pageNumber,
      consequenceText,
      rolledAt: Date.now()
    };
    room.lastRoll = lastRoll;

    const revealedRoll: RevealedRoll = {
      turnNumber,
      outcome,
      pageNumber,
      seed,
      commitmentHash
    };

    if (engineResult.state.phase === "COMPLETED") {
      room.phase = "COMPLETED";
      room.expiresAt = Date.now() + COMPLETED_ROOM_TTL_MS;
      room.currentTurnCommitment = null;
    } else if (engineResult.state.turn.phase === "AWAITING_ROLL") {
      // Turn advanced to next player: generate commitment for next turn
      const nextTurnNumber = engineResult.state.turn.turnNumber;
      const nextSeed = generateSecretSeed();
      const nextCommitmentHash = computeCommitment(nextSeed, engineResult.state.matchId, nextTurnNumber);
      room.currentTurnCommitment = {
        turnNumber: nextTurnNumber,
        seed: nextSeed,
        commitmentHash: nextCommitmentHash
      };
    } else if (engineResult.state.turn.phase === "AWAITING_SHOT") {
      // Mandatory shot required: no roll commitment while shooting
      room.currentTurnCommitment = null;
    }

    return {
      roomCode: room.roomCode,
      state: room.matchState,
      events: engineResult.events,
      rollResult: revealedRoll,
      lastRoll,
      nextCommitment: room.currentTurnCommitment
        ? {
            turnNumber: room.currentTurnCommitment.turnNumber,
            commitmentHash: room.currentTurnCommitment.commitmentHash
          }
        : null
    };
  }

  executeShot(
    rawCode: string,
    callerUserId: string,
    targetUserId: string,
    targetCellValue: CellValue,
    options?: CommandOptions
  ): {
    roomCode: string;
    state: MatchState;
    events: MatchEvent[];
    lastShot: RoomLastShotInfo;
    nextCommitment: PublicCommitment | null;
  } {
    const room = this.getRoomByCode(rawCode);
    if (!room) {
      throw new RoomError(404, "ROOM_NOT_FOUND", "Room not found or has expired");
    }

    if (room.phase !== "ACTIVE" || !room.matchState) {
      throw new RoomError(400, "MATCH_NOT_ACTIVE", "Cannot shoot: match is not active");
    }

    if (room.spectators.has(callerUserId)) {
      throw new RoomError(403, "SPECTATOR_FORBIDDEN", "Spectators have zero gameplay authority");
    }

    if (!room.players.has(callerUserId)) {
      throw new RoomError(403, "NOT_A_PLAYER", "Caller is not an active player in this match");
    }

    if (room.matchState.turn.currentPlayerId !== callerUserId) {
      throw new RoomError(400, "NOT_YOUR_TURN", "It is not your turn to shoot");
    }

    if (room.matchState.turn.phase !== "AWAITING_SHOT" || !room.matchState.turn.pendingShot) {
      throw new RoomError(400, "SHOT_NOT_AVAILABLE", "No shot entitlement pending");
    }

    if (callerUserId === targetUserId) {
      throw new RoomError(400, "INVALID_TARGET", "Shooter cannot target their own column");
    }

    const turnNumber = room.matchState.turn.turnNumber;
    const shooterUsername =
      room.matchState.players.find((p) => p.playerId === callerUserId)?.username ?? "Scribe";
    const targetUsername =
      room.matchState.players.find((p) => p.playerId === targetUserId)?.username ?? "Scribe";

    let engineResult;
    try {
      engineResult = applyShot(room.matchState, callerUserId, targetUserId, targetCellValue, options);
    } catch (err) {
      if (err instanceof GameRuleError) {
        const statusCode = err.code === "STALE_STATE" || err.code === "DUPLICATE_COMMAND" ? 409 : 400;
        throw new RoomError(statusCode, err.code, err.message);
      }
      throw err;
    }

    room.matchState = engineResult.state;

    const lastShot: RoomLastShotInfo = {
      id: crypto.randomUUID(),
      turnNumber,
      shooterPlayerId: callerUserId,
      shooterUsername,
      targetPlayerId: targetUserId,
      targetUsername,
      targetCellValue,
      shotAt: Date.now()
    };
    room.lastShot = lastShot;

    if (engineResult.state.phase === "COMPLETED") {
      room.phase = "COMPLETED";
      room.expiresAt = Date.now() + COMPLETED_ROOM_TTL_MS;
      room.currentTurnCommitment = null;
    } else if (engineResult.state.turn.phase === "AWAITING_ROLL") {
      // Shot taken and turn advanced to next player: generate commitment for next turn
      const nextTurnNumber = engineResult.state.turn.turnNumber;
      const nextSeed = generateSecretSeed();
      const nextCommitmentHash = computeCommitment(nextSeed, engineResult.state.matchId, nextTurnNumber);
      room.currentTurnCommitment = {
        turnNumber: nextTurnNumber,
        seed: nextSeed,
        commitmentHash: nextCommitmentHash
      };
    }

    return {
      roomCode: room.roomCode,
      state: room.matchState,
      events: engineResult.events,
      lastShot,
      nextCommitment: room.currentTurnCommitment
        ? {
            turnNumber: room.currentTurnCommitment.turnNumber,
            commitmentHash: room.currentTurnCommitment.commitmentHash
          }
        : null
    };
  }

  recordChatMessage(
    rawCode: string,
    userId: string,
    username: string,
    rawMessage: string,
    options?: { enforceRateLimit?: boolean; now?: number }
  ): { roomCode: string; chat: RoomChatMessage } {
    const now = options?.now ?? Date.now();
    const room = this.getRoomByCode(rawCode, now);
    if (!room) {
      throw new RoomError(404, "ROOM_NOT_FOUND", "Room not found or has expired");
    }
    if (!room.players.has(userId) && !room.spectators.has(userId)) {
      throw new RoomError(403, "NOT_IN_ROOM", "Must be in room to send chat messages");
    }

    const message = rawMessage.trim();
    if (!message) {
      throw new RoomError(400, "VALIDATION_ERROR", "Chat message cannot be empty");
    }

    if (options?.enforceRateLimit !== false) {
      const rate = room.httpChatRate.get(userId) ?? { lastChatAt: 0, mutedUntil: 0 };
      if (now < rate.mutedUntil) {
        throw new RoomError(
          429,
          "MUTED",
          "You are muted for sending messages too quickly. Please wait 30 seconds."
        );
      }
      if (now - rate.lastChatAt < CHAT_COOLDOWN_MS) {
        rate.mutedUntil = now + CHAT_MUTE_DURATION_MS;
        room.httpChatRate.set(userId, rate);
        throw new RoomError(
          429,
          "MUTED",
          "You are muted for sending messages too quickly. Please wait 30 seconds."
        );
      }
      rate.lastChatAt = now;
      room.httpChatRate.set(userId, rate);
    }

    const role = room.players.get(userId)?.role || "SPECTATOR";
    const chat: RoomChatMessage = {
      id: crypto.randomUUID(),
      senderUserId: userId,
      senderUsername: username,
      role,
      message: message.slice(0, 200),
      timestamp: now
    };

    room.recentChats.push(chat);
    if (room.recentChats.length > MAX_RECENT_CHATS) {
      room.recentChats.splice(0, room.recentChats.length - MAX_RECENT_CHATS);
    }

    return { roomCode: room.roomCode, chat };
  }

  recordEmojiReaction(
    rawCode: string,
    userId: string,
    username: string,
    emojiId: string,
    options?: { enforceRateLimit?: boolean; now?: number }
  ): { roomCode: string; emoji: RoomEmojiEvent | null } {
    const now = options?.now ?? Date.now();
    const room = this.getRoomByCode(rawCode, now);
    if (!room) {
      throw new RoomError(404, "ROOM_NOT_FOUND", "Room not found or has expired");
    }
    if (!room.players.has(userId) && !room.spectators.has(userId)) {
      throw new RoomError(403, "NOT_IN_ROOM", "Must be in room to send emoji reactions");
    }

    if (!ALLOWED_EMOJI_IDS.includes(emojiId as (typeof ALLOWED_EMOJI_IDS)[number])) {
      throw new RoomError(400, "VALIDATION_ERROR", `Invalid emoji ID: ${emojiId}`);
    }

    if (options?.enforceRateLimit !== false) {
      const windowStart = now - EMOJI_WINDOW_MS;
      const existing = (room.httpEmojiRate.get(userId) ?? []).filter((t) => t > windowStart);
      if (existing.length >= EMOJI_MAX_PER_WINDOW) {
        room.httpEmojiRate.set(userId, existing);
        return { roomCode: room.roomCode, emoji: null };
      }
      existing.push(now);
      room.httpEmojiRate.set(userId, existing);
    }

    const emoji: RoomEmojiEvent = {
      id: crypto.randomUUID(),
      senderUserId: userId,
      senderUsername: username,
      emojiId,
      timestamp: now
    };

    room.recentEmojis = room.recentEmojis
      .filter((e) => now - e.timestamp <= EMOJI_BUFFER_TTL_MS)
      .slice(-(MAX_RECENT_EMOJIS - 1));
    room.recentEmojis.push(emoji);

    return { roomCode: room.roomCode, emoji };
  }

  getMatch(rawCode: string): {
    state: MatchState;
    currentCommitment: PublicCommitment | null;
  } {
    const room = this.getRoomByCode(rawCode);
    if (!room) {
      throw new RoomError(404, "ROOM_NOT_FOUND", "Room not found or has expired");
    }

    if (!room.matchState) {
      throw new RoomError(404, "MATCH_NOT_STARTED", "Match has not been started yet");
    }

    return {
      state: room.matchState,
      currentCommitment: room.currentTurnCommitment
        ? {
            turnNumber: room.currentTurnCommitment.turnNumber,
            commitmentHash: room.currentTurnCommitment.commitmentHash
          }
        : null
    };
  }

  sweepExpiredRooms(now: number = Date.now()): number {
    let swept = 0;
    for (const room of this.roomsById.values()) {
      if (this.isExpired(room, now)) {
        this.deleteRoom(room);
        swept++;
      }
    }
    return swept;
  }

  deleteRoom(room: EphemeralRoom): void {
    for (const rec of room.disconnectedPlayers.values()) {
      clearTimeout(rec.timer);
    }
    room.disconnectedPlayers.clear();
    this.roomsById.delete(room.roomId);
    this.roomsByCode.delete(room.roomCode);
  }

  clear(): void {
    for (const room of this.roomsById.values()) {
      for (const rec of room.disconnectedPlayers.values()) {
        clearTimeout(rec.timer);
      }
      room.disconnectedPlayers.clear();
    }
    this.roomsById.clear();
    this.roomsByCode.clear();
  }

  bindParticipantSocket(
    rawCode: string,
    userId: string,
    socketId: string
  ): RoomParticipant | null {
    const room = this.getRoomByCode(rawCode);
    if (!room) return null;

    const player = room.players.get(userId);
    if (player) {
      player.socketId = socketId;
      player.connected = true;
      if (room.matchState) {
        const mp = room.matchState.players.find((p) => p.playerId === userId);
        if (mp) mp.connected = true;
      }
      return player;
    }

    const spectator = room.spectators.get(userId);
    if (spectator) {
      spectator.socketId = socketId;
      spectator.connected = true;
      return spectator;
    }

    return null;
  }

  unbindParticipantSocket(
    rawCode: string,
    userId: string,
    socketId: string
  ): { participant: RoomParticipant; wasActiveSocket: boolean } | null {
    const room = this.getRoomByCode(rawCode);
    if (!room) return null;

    const player = room.players.get(userId);
    if (player) {
      const wasActiveSocket = player.socketId === socketId;
      if (wasActiveSocket) {
        player.socketId = null;
        player.connected = false;
        if (room.matchState) {
          const mp = room.matchState.players.find((p) => p.playerId === userId);
          if (mp) mp.connected = false;
        }
      }
      return { participant: player, wasActiveSocket };
    }

    const spectator = room.spectators.get(userId);
    if (spectator) {
      const wasActiveSocket = spectator.socketId === socketId;
      if (wasActiveSocket) {
        spectator.socketId = null;
        spectator.connected = false;
      }
      return { participant: spectator, wasActiveSocket };
    }

    return null;
  }

  pauseMatchForPlayer(
    rawCode: string,
    disconnectedUserId: string,
    timeoutMs: number,
    timer: NodeJS.Timeout
  ): {
    room: EphemeralRoom;
    state: MatchState;
    events: MatchEvent[];
    deadline: number;
  } {
    const room = this.getRoomByCode(rawCode);
    if (!room || !room.matchState) {
      throw new RoomError(404, "ROOM_NOT_FOUND", "Room or active match not found");
    }

    if (room.phase === "COMPLETED") {
      throw new RoomError(400, "MATCH_COMPLETED", "Cannot pause a completed match");
    }

    const deadline = Date.now() + timeoutMs;
    room.disconnectedPlayers.set(disconnectedUserId, { deadline, timer });

    const participant = room.players.get(disconnectedUserId);
    if (participant) {
      participant.connected = false;
    }

    const engineResult = pauseMatch(room.matchState, disconnectedUserId, timeoutMs);
    room.matchState = engineResult.state;
    room.phase = "PAUSED";

    return {
      room,
      state: room.matchState,
      events: engineResult.events,
      deadline
    };
  }

  resumeMatchForPlayer(
    rawCode: string,
    reconnectedUserId: string
  ): {
    room: EphemeralRoom;
    state: MatchState;
    events: MatchEvent[];
    allReconnected: boolean;
  } {
    const room = this.getRoomByCode(rawCode);
    if (!room || !room.matchState) {
      throw new RoomError(404, "ROOM_NOT_FOUND", "Room or active match not found");
    }

    const record = room.disconnectedPlayers.get(reconnectedUserId);
    if (record) {
      clearTimeout(record.timer);
      room.disconnectedPlayers.delete(reconnectedUserId);
    }

    const participant = room.players.get(reconnectedUserId);
    if (participant) {
      participant.connected = true;
    }

    const playerInMatch = room.matchState.players.find((p) => p.playerId === reconnectedUserId);
    if (playerInMatch) {
      playerInMatch.connected = true;
    }

    const allReconnected = room.disconnectedPlayers.size === 0;
    const engineEvents: MatchEvent[] = [];

    if (allReconnected) {
      room.phase = "ACTIVE";
      room.matchState.phase = "ACTIVE";
      room.matchState.disconnectDeadline = null;
      room.matchState.version += 1;

      const event: MatchEvent = {
        eventId: crypto.randomUUID(),
        matchId: room.matchState.matchId,
        sequence: room.matchState.version,
        type: "MATCH_RESUMED",
        actorPlayerId: reconnectedUserId,
        serverTimestamp: Date.now()
      };
      engineEvents.push(event);
    }

    return {
      room,
      state: room.matchState,
      events: engineEvents,
      allReconnected
    };
  }

  eliminateDisconnectedPlayer(
    rawCode: string,
    targetUserId: string
  ): {
    room: EphemeralRoom;
    state: MatchState;
    events: MatchEvent[];
    newHostUserId?: string;
    nextCommitment?: PublicCommitment | null;
  } {
    const room = this.getRoomByCode(rawCode);
    if (!room || !room.matchState) {
      throw new RoomError(404, "ROOM_NOT_FOUND", "Room or active match not found");
    }

    // Clear and remove from disconnectedPlayers tracker
    const record = room.disconnectedPlayers.get(targetUserId);
    if (record) {
      clearTimeout(record.timer);
      room.disconnectedPlayers.delete(targetUserId);
    }

    const playerParticipant = room.players.get(targetUserId);
    if (playerParticipant) {
      playerParticipant.connected = false;
    }

    // Run engine elimination (clears pendingShot and 0 bullets retained if target was current player)
    const engineResult = eliminatePlayer(room.matchState, targetUserId, "DISCONNECT_TIMEOUT");
    room.matchState = engineResult.state;

    let newHostUserId: string | undefined;
    if (room.hostUserId === targetUserId) {
      const nextHost = this.migrateActiveMatchHost(room);
      if (nextHost) {
        newHostUserId = nextHost;
      }
    }

    // If match completed due to elimination (<= 1 active player remains)
    if (engineResult.state.phase === "COMPLETED") {
      room.phase = "COMPLETED";
      room.expiresAt = Date.now() + COMPLETED_ROOM_TTL_MS;
      room.currentTurnCommitment = null;
      // Clear any other pending disconnect timers
      for (const rec of room.disconnectedPlayers.values()) {
        clearTimeout(rec.timer);
      }
      room.disconnectedPlayers.clear();
    } else {
      // If there are other disconnected players, match stays PAUSED
      if (room.disconnectedPlayers.size > 0) {
        room.phase = "PAUSED";
        room.matchState.phase = "PAUSED";
      } else {
        // No more disconnected players -> resume to ACTIVE!
        room.phase = "ACTIVE";
        room.matchState.phase = "ACTIVE";
        room.matchState.disconnectDeadline = null;

        // If turn phase is AWAITING_ROLL, generate fresh commitment for the new turn
        if (room.matchState.turn.phase === "AWAITING_ROLL") {
          const nextTurnNumber = room.matchState.turn.turnNumber;
          const nextSeed = generateSecretSeed();
          const nextCommitmentHash = computeCommitment(nextSeed, room.matchState.matchId, nextTurnNumber);
          room.currentTurnCommitment = {
            turnNumber: nextTurnNumber,
            seed: nextSeed,
            commitmentHash: nextCommitmentHash
          };
        }
      }
    }

    return {
      room,
      state: room.matchState,
      events: engineResult.events,
      newHostUserId,
      nextCommitment: room.currentTurnCommitment
        ? {
            turnNumber: room.currentTurnCommitment.turnNumber,
            commitmentHash: room.currentTurnCommitment.commitmentHash
          }
        : null
    };
  }

  migrateActiveMatchHost(room: EphemeralRoom): string | null {
    if (!room.matchState) return null;
    const newHostId = getNextHostPlayerId(room.matchState.players);
    if (!newHostId || newHostId === room.hostUserId) return null;

    const oldHostId = room.hostUserId;
    room.hostUserId = newHostId;

    const oldHost = room.players.get(oldHostId);
    if (oldHost && oldHost.role === "HOST") {
      oldHost.role = "PLAYER";
    }

    const newHost = room.players.get(newHostId);
    if (newHost) {
      newHost.role = "HOST";
    }

    return newHostId;
  }

  generateTurnCommitment(room: EphemeralRoom, turnNumber: number): PublicCommitment {
    if (!room.matchState) {
      throw new RoomError(400, "MATCH_NOT_ACTIVE", "Match is not active");
    }
    const seed = generateSecretSeed();
    const commitmentHash = computeCommitment(seed, room.matchState.matchId, turnNumber);
    room.currentTurnCommitment = {
      turnNumber,
      seed,
      commitmentHash
    };
    return {
      turnNumber,
      commitmentHash
    };
  }

  private isExpired(room: EphemeralRoom, now: number = Date.now()): boolean {
    if (room.phase === "WAITING" && room.expiresAt !== null) {
      return now > room.expiresAt;
    }
    if (room.phase === "COMPLETED" && room.expiresAt !== null) {
      return now > room.expiresAt;
    }
    return false; // Active matches have null expiresAt (never expire by timer)
  }
}
