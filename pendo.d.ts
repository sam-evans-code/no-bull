interface PendoAgent {
  track: (
    eventName: string,
    properties?: Record<string, string | number | boolean>
  ) => void;
}

declare global {
  interface Window {
    pendo?: PendoAgent;
  }
}

export {};
