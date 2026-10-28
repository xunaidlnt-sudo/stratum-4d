// Bridge exposed by electron/preload.cjs. Absent in the browser build.
interface Window {
  stratumDesktop?: {
    isDesktop: true;
    invoke: <T = unknown>(method: string, ...args: unknown[]) => Promise<T>;
    info: () => Promise<{ dbFile: string; version: string; pdf: boolean }>;
    oauth?: (op: "signIn" | "token" | "signOut", args: { provider: "gdrive" | "onedrive"; clientId: string; clientSecret?: string }) => Promise<{ access_token: string; expires_in?: number } | null>;
    onOpenFile: (callback: (file: { name: string; bytes: Uint8Array }) => void) => () => void;
  };
}
