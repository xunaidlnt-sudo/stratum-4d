// OneDrive / SharePoint through Microsoft Graph, signed in with MSAL (a popup).
// Ids are "driveId!itemId" so folders shared from a colleague's drive work.

import type { AccountInfo, PublicClientApplication } from "@azure/msal-browser";
import { PreconditionFailed, type CloudDrive, type CloudFile, type CloudFolder } from "./drive";

const SCOPES = ["Files.ReadWrite.All", "User.Read"];
const GRAPH = "https://graph.microsoft.com/v1.0";

const split = (id: string) => {
  const i = id.indexOf("!");
  return i < 0 ? { drive: null, item: id } : { drive: id.slice(0, i), item: id.slice(i + 1) };
};
const itemPath = (id: string) => {
  const { drive, item } = split(id);
  return drive ? `/drives/${drive}/items/${item}` : `/me/drive/items/${item}`;
};

/** The page MSAL returns to after sign-in: a blank page next to the app. */
export const msRedirectUri = () => new URL("auth.html", location.href).href;

export function oneDrive(clientId: string): CloudDrive & { signIn(): Promise<void>; signedIn(): boolean } {
  let app: PublicClientApplication | null = null;
  let account: AccountInfo | null = null;
  const init = async () => {
    if (app) return app;
    if (!clientId) throw new Error("No Microsoft application (client) ID. Add it in Settings › Data (see docs/CLOUD_STORAGE.md).");
    const msal = await import("@azure/msal-browser");
    app = new msal.PublicClientApplication({ auth: { clientId, authority: "https://login.microsoftonline.com/common", redirectUri: msRedirectUri() }, cache: { cacheLocation: "localStorage" } });
    await app.initialize();
    account = app.getAllAccounts()[0] ?? null;
    return app;
  };
  const token = async (): Promise<string> => {
    const a = await init();
    if (!account) {
      const r = await a.loginPopup({ scopes: SCOPES, prompt: "select_account" });
      account = r.account;
    }
    try {
      return (await a.acquireTokenSilent({ scopes: SCOPES, account: account! })).accessToken;
    } catch {
      const r = await a.acquireTokenPopup({ scopes: SCOPES, account: account! });
      account = r.account;
      return r.accessToken;
    }
  };
  const call = async (path: string, init: RequestInit = {}, ok: number[] = []): Promise<Response> => {
    const r = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await token()}` } });
    if (!r.ok && !ok.includes(r.status)) throw new Error(`OneDrive: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r;
  };
  const fileOf = (x: { id: string; name: string; eTag?: string; parentReference?: { driveId?: string } }, drive: string | null): CloudFile => ({
    id: `${x.parentReference?.driveId ?? drive ?? ""}!${x.id}`,
    name: x.name,
    etag: x.eTag ?? "",
  });

  const od: CloudDrive & { signIn(): Promise<void>; signedIn(): boolean } = {
    provider: "onedrive",
    label: "OneDrive",
    signedIn: () => !!account,
    async signIn() {
      const a = await init();
      const r = await a.loginPopup({ scopes: SCOPES, prompt: "select_account" });
      account = r.account;
    },
    async account() {
      const r = await (await call("/me?$select=displayName,mail,userPrincipalName")).json();
      return { email: r.mail ?? r.userPrincipalName ?? "", name: r.displayName ?? "" };
    },
    async list(folderId) {
      const out: CloudFile[] = [];
      let next: string | null = `${itemPath(folderId)}/children?$select=id,name,eTag,file,parentReference&$top=999`;
      while (next) {
        const r: { value: { id: string; name: string; eTag?: string; file?: unknown; parentReference?: { driveId?: string } }[]; "@odata.nextLink"?: string } = await (await call(next)).json();
        for (const x of r.value) if (x.file) out.push(fileOf(x, split(folderId).drive));
        next = r["@odata.nextLink"] ?? null;
      }
      return out;
    },
    async find(folderId, name) {
      const r = await call(`${itemPath(folderId)}:/${encodeURIComponent(name)}?$select=id,name,eTag,parentReference`, {}, [404]);
      return r.status === 404 ? null : fileOf(await r.json(), split(folderId).drive);
    },
    async read(f) {
      return (await call(`${itemPath(f.id)}/content`)).text();
    },
    async write(folderId, name, text, opts) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      let url = `${itemPath(folderId)}:/${encodeURIComponent(name)}:/content`;
      if (opts?.ifMatch !== undefined) {
        if (opts.ifMatch) headers["If-Match"] = opts.ifMatch;
        else url += "?@microsoft.graph.conflictBehavior=fail";
      }
      const r = await call(url, { method: "PUT", headers, body: text }, [409, 412]);
      if (r.status === 409 || r.status === 412) throw new PreconditionFailed("changed");
      return fileOf(await r.json(), split(folderId).drive);
    },
    async remove(f) {
      await call(itemPath(f.id), { method: "DELETE" }, [404]);
    },
    async folders(parent) {
      if (parent === null)
        return [
          { id: "~me", name: "My files" },
          { id: "~shared", name: "Shared with me" },
        ];
      if (parent === "~shared") {
        const r = await (await call("/me/drive/sharedWithMe")).json();
        return (r.value ?? [])
          .filter((x: { remoteItem?: { folder?: unknown } }) => x.remoteItem?.folder)
          .map((x: { name: string; remoteItem: { id: string; parentReference: { driveId: string } } }) => ({ id: `${x.remoteItem.parentReference.driveId}!${x.remoteItem.id}`, name: x.name }));
      }
      const path = parent === "~me" ? "/me/drive/root/children" : `${itemPath(parent)}/children`;
      const r = await (await call(`${path}?$select=id,name,folder,parentReference&$top=999`)).json();
      return (r.value ?? []).filter((x: { folder?: unknown }) => x.folder).map((x: { id: string; name: string; parentReference?: { driveId?: string } }) => ({ id: `${x.parentReference?.driveId ?? split(parent).drive ?? ""}!${x.id}`, name: x.name }));
    },
    async createFolder(parent, name): Promise<CloudFolder> {
      const path = !parent || parent === "~me" || parent === "~shared" ? "/me/drive/root/children" : `${itemPath(parent)}/children`;
      const x = await (await call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }) })).json();
      return { id: `${x.parentReference?.driveId ?? ""}!${x.id}`, name: x.name };
    },
  };
  return od;
}
