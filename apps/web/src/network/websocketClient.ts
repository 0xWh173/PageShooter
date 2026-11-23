import {
  type WSClientMessage,
  type WSServerMessage,
  type CellValue
} from "@pageshooter/shared";
import { SyncStore } from "./syncStore.js";
import { apiClient, ApiError } from "./apiClient.js";

export interface WebSocketClientOptions {
  url: string;
  token?: string;
  syncStore?: SyncStore;
  autoReconnect?: boolean;
  enableHttpFallback?: boolean;
  preferHttpFallback?: boolean;
}

export type MessageListener = (message: WSServerMessage) => void;
export type ErrorListener = (error: unknown) => void;
export type CloseListener = (code: number, reason: string) => void;
export type ConnectionStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "SUPERSEDED";
export type StatusListener = (status: ConnectionStatus) => void;

export class WebSocketClient {
  public readonly syncStore: SyncStore;
  private ws: WebSocket | null = null;
  private url: string;
  private token?: string;
  private autoReconnect: boolean;
  private enableHttpFallback: boolean;
  private preferHttpFallback: boolean;
  private httpFallbackActive = false;
  private httpPollTimer: ReturnType<typeof setInterval> | null = null;
  private activeRoomCode: string | null = null;
  private manualDisconnect = false;
  private reconnectAttempts = 0;
  private consecutiveWsFailures = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastServerTrafficAt = 0;
  private messageQueue: Promise<void> = Promise.resolve();
  private seenEmojiIds = new Set<string>();
  private lastPolledRollTurn = 0;
  private lastPolledShotId: string | null = null;
  private status: ConnectionStatus = "DISCONNECTED";
  private connected = false;
  private messageListeners = new Set<MessageListener>();
  private errorListeners = new Set<ErrorListener>();
  private closeListeners = new Set<CloseListener>();
  private statusListeners = new Set<StatusListener>();
  private connectPromise: Promise<void> | null = null;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;

  constructor(options: WebSocketClientOptions) {
    this.url = options.url;
    this.token = options.token;
    this.autoReconnect = options.autoReconnect ?? false;
    this.enableHttpFallback = options.enableHttpFallback ?? false;
    this.preferHttpFallback = options.preferHttpFallback ?? false;
    this.syncStore = options.syncStore ?? new SyncStore();
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  get transportMode(): "WS" | "HTTP_POLLING" {
    return this.httpFallbackActive ? "HTTP_POLLING" : "WS";
  }

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const listener of this.statusListeners) {
      try {
        listener(next);
      } catch {
        // Ignore
      }
    }
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  get isConnected(): boolean {
    if (this.httpFallbackActive) return this.connected;
    return this.connected && this.ws?.readyState === 1; // WebSocket.OPEN
  }

  async connect(): Promise<void> {
    if (this.connected && this.ws?.readyState === 1) {
      return;
    }

    this.manualDisconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setStatus(this.reconnectAttempts > 0 ? "RECONNECTING" : "CONNECTING");

    if (this.preferHttpFallback && this.enableHttpFallback) {
      this.httpFallbackActive = true;
      this.connected = true;
      this.setStatus("CONNECTED");
      return;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
    });

    const fullUrl = this.token
      ? `${this.url}${this.url.includes("?") ? "&" : "?"}token=${encodeURIComponent(this.token)}`
      : this.url;
    const socket = new globalThis.WebSocket(fullUrl);
    this.ws = socket;

    socket.onopen = () => {
      this.lastServerTrafficAt = Date.now();
    };

    socket.onmessage = (event: MessageEvent) => {
      this.lastServerTrafficAt = Date.now();
      let message: WSServerMessage;
      try {
        message = JSON.parse(
          typeof event.data === "string" ? event.data : event.data.toString()
        ) as WSServerMessage;
      } catch (err) {
        this.emitError(new Error(`Failed to parse WebSocket message: ${err}`));
        return;
      }

      // Serialize incoming frames strictly in arrival order so async SHA-256
      // verification in ROLL_REVEALED finishes BEFORE MATCH_STATE_SYNC / ROLL_COMMITMENT.
      this.messageQueue = this.messageQueue
        .then(() => this.handleServerMessage(message))
        .catch((err) => {
          this.emitError(err);
        });
    };

    socket.onclose = (event: CloseEvent) => {
      this.stopWatchdog();
      const wasConnected = this.connected;
      this.connected = false;

      if (!wasConnected) {
        this.consecutiveWsFailures += 1;
      }

      if (
        this.enableHttpFallback &&
        !this.manualDisconnect &&
        event.code !== 4401 &&
        event.code !== 4409 &&
        (this.preferHttpFallback || (!wasConnected && this.consecutiveWsFailures >= 2))
      ) {
        // Serverless HTTP environment (e.g. Vercel) or repeated WS upgrade failure:
        // seamlessly activate HTTP real-time polling fallback
        this.httpFallbackActive = true;
        this.connected = true;
        this.setStatus("CONNECTED");
        if (this.connectResolve) {
          this.connectResolve();
          this.connectResolve = null;
          this.connectReject = null;
        }
        const existingRoom = this.syncStore.getState().room?.roomCode ?? this.activeRoomCode;
        if (existingRoom) {
          this.startHttpRoomPolling(existingRoom);
        }
        return;
      }

      if (this.connectReject) {
        this.connectReject(
          new Error(`WebSocket closed before authentication (Code: ${event.code}, Reason: ${event.reason})`)
        );
        this.connectReject = null;
        this.connectResolve = null;
      }

      if (event.code === 4409) {
        this.setStatus("SUPERSEDED");
      } else if (
        this.autoReconnect &&
        !this.manualDisconnect &&
        event.code !== 1000 &&
        event.code !== 4401
      ) {
        this.scheduleReconnect();
      } else {
        this.setStatus("DISCONNECTED");
      }

      for (const listener of this.closeListeners) {
        try {
          listener(event.code, event.reason);
        } catch {
          // Ignore
        }
      }
    };

    socket.onerror = (event: Event) => {
      this.emitError(new Error(`WebSocket encountered error: ${JSON.stringify(event)}`));
    };

    return this.connectPromise;
  }

  private async handleServerMessage(message: WSServerMessage): Promise<void> {
    switch (message.type) {
      case "AUTH_SUCCESS": {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.consecutiveWsFailures = 0;
        this.lastServerTrafficAt = Date.now();
        this.startWatchdog();
        this.setStatus("CONNECTED");
        if (this.connectResolve) {
          this.connectResolve();
          this.connectResolve = null;
          this.connectReject = null;
        }
        break;
      }

      case "ROOM_SNAPSHOT": {
        this.syncStore.applyRoomSnapshot(message.room, message.serverInstanceId);
        break;
      }

      case "PLAYER_JOINED": {
        this.syncStore.applyPlayerJoined(message.player);
        break;
      }

      case "PLAYER_LEFT": {
        this.syncStore.applyPlayerLeft(message.userId);
        break;
      }

      case "PLAYER_KICKED": {
        this.syncStore.applyPlayerKicked(message.targetUserId);
        break;
      }

      case "SPECTATOR_JOINED": {
        this.syncStore.applySpectatorJoined(message.spectator);
        break;
      }

      case "SPECTATOR_LEFT": {
        this.syncStore.applySpectatorLeft(message.userId);
        break;
      }

      case "HOST_MIGRATED": {
        this.syncStore.applyHostMigrated(message.newHostUserId, message.reason);
        break;
      }

      case "MATCH_STARTED": {
        this.syncStore.applyMatchStarted(message.matchState);
        break;
      }

      case "ROLL_COMMITMENT": {
        this.syncStore.applyCommitment(message.turnNumber, message.commitmentHash);
        break;
      }

      case "ROLL_REVEALED": {
        try {
          await this.syncStore.applyRollRevealed(
            message.turnNumber,
            message.outcome,
            message.pageNumber,
            message.seed
          );
        } catch (err) {
          this.emitError(err);
        }
        break;
      }

      case "MATCH_STATE_SYNC": {
        this.syncStore.applyMatchStateSync(message.matchState, message.events);
        break;
      }

      case "MATCH_PAUSED": {
        this.syncStore.applyMatchPaused(message.disconnectedPlayerId, message.deadline);
        break;
      }

      case "MATCH_RESUMED": {
        this.syncStore.applyMatchResumed(message.reconnectedPlayerId);
        break;
      }

      case "PLAYER_ELIMINATED": {
        this.syncStore.applyPlayerEliminated(message.targetPlayerId);
        break;
      }

      case "MATCH_COMPLETED": {
        this.syncStore.applyMatchCompleted(
          message.matchState,
          message.winnerPlayerId,
          message.winReason
        );
        break;
      }

      case "MATCH_TERMINATED_SERVER_RESTART": {
        this.syncStore.applyMatchTerminated(message.message);
        break;
      }

      case "CHAT_BROADCAST": {
        this.syncStore.applyChatBroadcast({
          id: message.id,
          senderUserId: message.senderUserId,
          senderUsername: message.senderUsername,
          role: message.role,
          message: message.message,
          timestamp: message.timestamp
        });
        break;
      }

      case "PING": {
        try {
          this.send({ type: "PONG" });
        } catch {
          // Ignore if closing
        }
        break;
      }

      case "ERROR": {
        if (message.code === "MATCH_UNAVAILABLE") {
          this.syncStore.applyMatchTerminated(message.message);
        }
        break;
      }
    }

    // Notify all general message listeners
    for (const listener of this.messageListeners) {
      try {
        listener(message);
      } catch {
        // Ignore
      }
    }
  }

  private startHttpRoomPolling(roomCode: string): void {
    const normalized = roomCode.trim().toUpperCase();
    this.activeRoomCode = normalized;
    if (this.httpPollTimer) {
      clearInterval(this.httpPollTimer);
    }

    const pollOnce = async () => {
      if (this.manualDisconnect || !this.activeRoomCode) return;
      try {
        const { room } = await apiClient.getRoom(this.activeRoomCode);
        const prevRoom = this.syncStore.getState().room;
        const prevMatch = this.syncStore.getState().match;

        await this.handleServerMessage({
          type: "ROOM_SNAPSHOT",
          room,
          serverInstanceId: "vercel-serverless"
        });

        // Replay unseen emoji reactions for HTTP-polling clients
        if (room.recentEmojis && room.recentEmojis.length > 0) {
          for (const emoji of room.recentEmojis) {
            if (!this.seenEmojiIds.has(emoji.id)) {
              this.seenEmojiIds.add(emoji.id);
              if (this.seenEmojiIds.size > 100) {
                const first = this.seenEmojiIds.values().next().value;
                if (first) this.seenEmojiIds.delete(first);
              }
              await this.handleServerMessage({
                type: "EMOJI_BROADCAST",
                id: emoji.id,
                senderUserId: emoji.senderUserId,
                senderUsername: emoji.senderUsername,
                emojiId: emoji.emojiId,
                timestamp: emoji.timestamp
              });
            }
          }
        }

        // Trigger comical book-turning animation for other polling players when a new roll happens
        if (room.lastRoll && room.lastRoll.turnNumber > this.lastPolledRollTurn) {
          this.lastPolledRollTurn = room.lastRoll.turnNumber;
          this.syncStore.applyPolledRoll(
            room.lastRoll.turnNumber,
            room.lastRoll.outcome,
            room.lastRoll.pageNumber
          );
          const syntheticReveal: WSServerMessage = {
            type: "ROLL_REVEALED",
            turnNumber: room.lastRoll.turnNumber,
            outcome: room.lastRoll.outcome,
            pageNumber: room.lastRoll.pageNumber,
            seed: "",
            actorPlayerId: room.lastRoll.actorPlayerId,
            actorUsername: room.lastRoll.actorUsername,
            consequenceText: room.lastRoll.consequenceText
          };
          for (const listener of this.messageListeners) {
            try {
              listener(syntheticReveal);
            } catch {
              // Ignore
            }
          }
        }

        if (room.match) {
          const syntheticShotEvents =
            room.lastShot && room.lastShot.id !== this.lastPolledShotId
              ? (() => {
                  this.lastPolledShotId = room.lastShot.id;
                  return [
                    {
                      eventId: room.lastShot.id,
                      matchId: room.match.matchId,
                      sequence: room.match.version,
                      type: "SHOT_ACCEPTED" as const,
                      actorPlayerId: room.lastShot.shooterPlayerId,
                      actorUsername: room.lastShot.shooterUsername,
                      targetPlayerId: room.lastShot.targetPlayerId,
                      targetUsername: room.lastShot.targetUsername,
                      cellValue: room.lastShot.targetCellValue,
                      serverTimestamp: room.lastShot.shotAt
                    }
                  ];
                })()
              : [];

          if (!prevRoom || (prevRoom.phase === "WAITING" && room.phase === "ACTIVE")) {
            await this.handleServerMessage({
              type: "MATCH_STARTED",
              matchState: room.match
            });
          } else if (!prevMatch || room.match.version > prevMatch.version || syntheticShotEvents.length > 0) {
            await this.handleServerMessage({
              type: "MATCH_STATE_SYNC",
              matchState: room.match,
              events: syntheticShotEvents
            });
          }

          if (room.match.phase === "COMPLETED" && room.match.winnerPlayerId && room.match.winReason) {
            await this.handleServerMessage({
              type: "MATCH_COMPLETED",
              matchState: room.match,
              winnerPlayerId: room.match.winnerPlayerId,
              winReason: room.match.winReason
            });
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    };

    void pollOnce();
    this.httpPollTimer = setInterval(() => {
      void pollOnce();
    }, 900);
  }

  send(message: WSClientMessage): void {
    if (this.httpFallbackActive) {
      void this.dispatchHttpFallbackMessage(message);
      return;
    }
    if (!this.ws || this.ws.readyState !== 1 /* WebSocket.OPEN */) {
      throw new Error("Cannot send message: WebSocket is not open.");
    }
    this.ws.send(JSON.stringify(message));
  }

  private async dispatchHttpFallbackMessage(message: WSClientMessage): Promise<void> {
    try {
      switch (message.type) {
        case "JOIN_ROOM":
        case "JOIN_AS_SPECTATOR":
        case "RECONNECT_MATCH": {
          this.startHttpRoomPolling(message.roomCode);
          break;
        }
        case "LEAVE_ROOM": {
          if (this.httpPollTimer) {
            clearInterval(this.httpPollTimer);
            this.httpPollTimer = null;
          }
          this.activeRoomCode = null;
          await apiClient.leaveRoom(message.roomCode);
          break;
        }
        case "KICK_PLAYER": {
          await apiClient.kickPlayer(message.roomCode, message.targetUserId);
          break;
        }
        case "START_MATCH": {
          const res = await apiClient.startMatch(message.roomCode);
          await this.handleServerMessage({
            type: "MATCH_STARTED",
            matchState: res.match
          });
          if (res.currentCommitment) {
            await this.handleServerMessage({
              type: "ROLL_COMMITMENT",
              turnNumber: res.currentCommitment.turnNumber,
              commitmentHash: res.currentCommitment.commitmentHash
            });
          }
          break;
        }
        case "ROLL_REQUEST": {
          const res = await apiClient.rollTurn(
            message.roomCode,
            message.expectedStateVersion,
            message.correlationId
          );
          this.lastPolledRollTurn = res.rollResult.turnNumber;
          if (
            this.syncStore.getState().activeCommitment?.turnNumber === res.rollResult.turnNumber
          ) {
            await this.handleServerMessage({
              type: "ROLL_REVEALED",
              turnNumber: res.rollResult.turnNumber,
              outcome: res.rollResult.outcome,
              pageNumber: res.rollResult.pageNumber,
              seed: res.rollResult.seed,
              actorPlayerId: res.lastRoll?.actorPlayerId,
              actorUsername: res.lastRoll?.actorUsername,
              consequenceText: res.lastRoll?.consequenceText
            });
          } else {
            this.syncStore.applyPolledRoll(
              res.rollResult.turnNumber,
              res.rollResult.outcome,
              res.rollResult.pageNumber
            );
            const fallbackReveal: WSServerMessage = {
              type: "ROLL_REVEALED",
              turnNumber: res.rollResult.turnNumber,
              outcome: res.rollResult.outcome,
              pageNumber: res.rollResult.pageNumber,
              seed: res.rollResult.seed,
              actorPlayerId: res.lastRoll?.actorPlayerId,
              actorUsername: res.lastRoll?.actorUsername,
              consequenceText: res.lastRoll?.consequenceText
            };
            for (const listener of this.messageListeners) {
              try {
                listener(fallbackReveal);
              } catch {
                // Ignore
              }
            }
          }
          await this.handleServerMessage({
            type: "MATCH_STATE_SYNC",
            matchState: res.state,
            events: res.events
          });
          if (res.nextCommitment) {
            await this.handleServerMessage({
              type: "ROLL_COMMITMENT",
              turnNumber: res.nextCommitment.turnNumber,
              commitmentHash: res.nextCommitment.commitmentHash
            });
          }
          if (
            res.state.phase === "COMPLETED" &&
            res.state.winnerPlayerId &&
            res.state.winReason
          ) {
            await this.handleServerMessage({
              type: "MATCH_COMPLETED",
              matchState: res.state,
              winnerPlayerId: res.state.winnerPlayerId,
              winReason: res.state.winReason
            });
          }
          break;
        }
        case "SHOOT_REQUEST": {
          const res = await apiClient.shootTurn(
            message.roomCode,
            message.targetPlayerId,
            message.targetCellValue,
            message.expectedStateVersion,
            message.correlationId
          );
          if (res.lastShot) {
            this.lastPolledShotId = res.lastShot.id;
          }
          await this.handleServerMessage({
            type: "MATCH_STATE_SYNC",
            matchState: res.state,
            events: res.events
          });
          if (res.nextCommitment) {
            await this.handleServerMessage({
              type: "ROLL_COMMITMENT",
              turnNumber: res.nextCommitment.turnNumber,
              commitmentHash: res.nextCommitment.commitmentHash
            });
          }
          if (
            res.state.phase === "COMPLETED" &&
            res.state.winnerPlayerId &&
            res.state.winReason
          ) {
            await this.handleServerMessage({
              type: "MATCH_COMPLETED",
              matchState: res.state,
              winnerPlayerId: res.state.winnerPlayerId,
              winReason: res.state.winReason
            });
          }
          break;
        }
        case "SEND_CHAT_MESSAGE": {
          const { chat } = await apiClient.sendChat(message.roomCode, message.message);
          await this.handleServerMessage({
            type: "CHAT_BROADCAST",
            id: chat.id,
            senderUserId: chat.senderUserId,
            senderUsername: chat.senderUsername,
            role: chat.role,
            message: chat.message,
            timestamp: chat.timestamp
          });
          break;
        }
        case "SEND_EMOJI_REACTION": {
          const { emoji } = await apiClient.sendEmoji(message.roomCode, message.emojiId);
          if (emoji) {
            this.seenEmojiIds.add(emoji.id);
            await this.handleServerMessage({
              type: "EMOJI_BROADCAST",
              id: emoji.id,
              senderUserId: emoji.senderUserId,
              senderUsername: emoji.senderUsername,
              emojiId: emoji.emojiId,
              timestamp: emoji.timestamp
            });
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      if (err instanceof ApiError) {
        await this.handleServerMessage({
          type: "ERROR",
          code: err.code,
          message: err.message
        });
      }
      this.emitError(err);
    }
  }

  joinRoom(roomCode: string, correlationId: string = crypto.randomUUID()): void {
    this.send({
      type: "JOIN_ROOM",
      correlationId,
      roomCode
    });
  }

  joinAsSpectator(roomCode: string, correlationId: string = crypto.randomUUID()): void {
    this.send({
      type: "JOIN_AS_SPECTATOR",
      correlationId,
      roomCode
    });
  }

  leaveRoom(roomCode: string, correlationId: string = crypto.randomUUID()): void {
    this.send({
      type: "LEAVE_ROOM",
      correlationId,
      roomCode
    });
  }

  kickPlayer(
    roomCode: string,
    targetUserId: string,
    correlationId: string = crypto.randomUUID()
  ): void {
    this.send({
      type: "KICK_PLAYER",
      correlationId,
      roomCode,
      targetUserId
    });
  }

  startMatch(roomCode: string, correlationId: string = crypto.randomUUID()): void {
    this.send({
      type: "START_MATCH",
      correlationId,
      roomCode
    });
  }

  roll(
    roomCode: string,
    expectedStateVersion: number,
    correlationId: string = crypto.randomUUID()
  ): void {
    this.send({
      type: "ROLL_REQUEST",
      correlationId,
      roomCode,
      expectedStateVersion
    });
  }

  shoot(
    roomCode: string,
    targetPlayerId: string,
    targetCellValue: CellValue,
    expectedStateVersion: number,
    correlationId: string = crypto.randomUUID()
  ): void {
    this.send({
      type: "SHOOT_REQUEST",
      correlationId,
      roomCode,
      targetPlayerId,
      targetCellValue,
      expectedStateVersion
    });
  }

  sendChat(
    roomCode: string,
    message: string,
    correlationId: string = crypto.randomUUID()
  ): void {
    this.send({
      type: "SEND_CHAT_MESSAGE",
      correlationId,
      roomCode,
      message
    });
  }

  sendEmoji(
    roomCode: string,
    emojiId: string,
    correlationId: string = crypto.randomUUID()
  ): void {
    this.send({
      type: "SEND_EMOJI_REACTION",
      correlationId,
      roomCode,
      emojiId
    });
  }

  reconnectMatch(
    roomCode: string,
    lastKnownVersion: number,
    correlationId: string = crypto.randomUUID()
  ): void {
    this.send({
      type: "RECONNECT_MATCH",
      correlationId,
      roomCode,
      lastKnownVersion,
      serverInstanceId: this.syncStore.getState().serverInstanceId ?? undefined
    });
  }

  ping(): void {
    this.send({ type: "PING" });
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onClose(listener: CloseListener): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  private emitError(err: unknown): void {
    for (const listener of this.errorListeners) {
      try {
        listener(err);
      } catch {
        // Ignore
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.manualDisconnect || this.reconnectTimer) return;
    this.setStatus("RECONNECTING");
    const delayMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualDisconnect) return;
      this.connect()
        .then(() => {
          const state = this.syncStore.getState();
          if (state.room && (state.room.phase === "ACTIVE" || state.room.phase === "PAUSED")) {
            this.reconnectMatch(state.room.roomCode, state.match?.version ?? 0);
          } else if (state.room) {
            this.joinRoom(state.room.roomCode);
          }
        })
        .catch(() => {
          // Next close event or backoff will retry
        });
    }, delayMs);
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (this.httpFallbackActive || this.manualDisconnect || !this.ws) return;
      if (Date.now() - this.lastServerTrafficAt > 40_000) {
        // Silent drop detected: force close so auto-reconnect kicks in
        try {
          this.ws.close(4000, "Client heartbeat timeout");
        } catch {
          // Ignore
        }
      }
    }, 10_000);
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  reconnectNow(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.manualDisconnect = false;
    this.httpFallbackActive = false;
    this.consecutiveWsFailures = 0;
    this.reconnectAttempts = 0;
    if (this.ws) {
      try {
        this.ws.close(1000, "Manual reconnect");
      } catch {
        // Ignore
      }
      this.ws = null;
    }
    this.connected = false;
    this.connect()
      .then(() => {
        const state = this.syncStore.getState();
        const code = state.room?.roomCode ?? this.activeRoomCode;
        if (code && state.room && (state.room.phase === "ACTIVE" || state.room.phase === "PAUSED")) {
          this.reconnectMatch(code, state.match?.version ?? 0);
        } else if (code) {
          this.joinRoom(code);
        }
      })
      .catch(() => {
        // Handled by onclose / autoReconnect
      });
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.activeRoomCode = null;
    this.stopWatchdog();
    if (this.httpPollTimer) {
      clearInterval(this.httpPollTimer);
      this.httpPollTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(1000, "Normal Closure");
      } catch {
        // Ignore
      }
      this.ws = null;
    }
    this.httpFallbackActive = false;
    this.connected = false;
    this.setStatus("DISCONNECTED");
  }
}
