import {
  type WSClientMessage,
  type WSServerMessage,
  type CellValue
} from "@pageshooter/shared";
import { SyncStore } from "./syncStore.js";

export interface WebSocketClientOptions {
  url: string;
  token?: string;
  syncStore?: SyncStore;
  autoReconnect?: boolean;
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
  private manualDisconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
    this.syncStore = options.syncStore ?? new SyncStore();
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
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
      // Waiting for AUTH_SUCCESS from server
    };

    socket.onmessage = async (event: MessageEvent) => {
      let message: WSServerMessage;
      try {
        message = JSON.parse(
          typeof event.data === "string" ? event.data : event.data.toString()
        ) as WSServerMessage;
      } catch (err) {
        this.emitError(new Error(`Failed to parse WebSocket message: ${err}`));
        return;
      }

      await this.handleServerMessage(message);
    };

    socket.onclose = (event: CloseEvent) => {
      this.connected = false;
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
          senderUserId: message.senderUserId,
          senderUsername: message.senderUsername,
          role: message.role,
          message: message.message,
          timestamp: message.timestamp
        });
        break;
      }

      case "PING": {
        this.send({ type: "PING" });
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

  send(message: WSClientMessage): void {
    if (!this.ws || this.ws.readyState !== 1 /* WebSocket.OPEN */) {
      throw new Error("Cannot send message: WebSocket is not open.");
    }
    this.ws.send(JSON.stringify(message));
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

  disconnect(): void {
    this.manualDisconnect = true;
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
    this.connected = false;
    this.setStatus("DISCONNECTED");
  }
}
