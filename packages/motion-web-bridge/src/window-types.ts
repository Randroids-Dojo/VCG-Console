export interface BridgePostTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface BridgeMessageEvent {
  data: unknown;
  origin: string;
  source: BridgePostTarget | null;
}

export type BridgeMessageListener = (event: BridgeMessageEvent) => void;

export interface BridgeMessageReceiver {
  addEventListener(type: "message", listener: BridgeMessageListener): void;
  removeEventListener(type: "message", listener: BridgeMessageListener): void;
}
