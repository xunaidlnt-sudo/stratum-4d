import { Capacitor, registerPlugin } from "@capacitor/core";

/** True inside the Android app (Capacitor). */
export const isNativeApp = () => Capacitor.isNativePlatform();

/**
 * True on phones and tablets (Android, iPhone, iPad), in the app or in the browser.
 * Their file pickers grey out files whose extension they do not know (.xer, .ifc),
 * so no type filter is set there.
 */
export const isMobileDevice = () =>
  isNativeApp() ||
  (typeof navigator !== "undefined" &&
    (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1)));

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (!isMobileDevice()) input.accept = accept;
    // Some mobile browsers fire "change" only for an input that is in the page.
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    input.addEventListener("cancel", () => {
      resolve(null);
      input.remove();
    });
    input.click();
  });
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** In the Android app: write to Documents, then offer the share sheet (Drive, email, Files…). */
async function saveNative(name: string, blob: Blob) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
  const safe = name.replace(/[\\/:*?"<>|]+/g, "_");
  const res = await Filesystem.writeFile({ path: `Stratum 4D/${safe}`, data: await toBase64(blob), directory: Directory.Documents, recursive: true });
  try {
    await Share.share({ title: safe, files: [res.uri] });
  } catch {
    // Share sheet dismissed: the file is still in Documents/Stratum 4D.
  }
}

export function download(name: string, data: BlobPart, type = "application/octet-stream") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  if (isNativeApp()) {
    void saveNative(name, blob).catch((e) => window.alert(`Could not save ${name}: ${(e as Error).message}`));
    return;
  }
  const url = URL.createObjectURL(blob);
  clickLink(url, name);
  // Mobile browsers read the file after the click returns: keep the link alive for a minute.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A download link in the page (Firefox and some mobile browsers ignore one that is not). */
function clickLink(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}

export function downloadDataUrl(name: string, dataUrl: string) {
  if (isNativeApp()) {
    void fetch(dataUrl)
      .then((r) => r.blob())
      .then((b) => saveNative(name, b));
    return;
  }
  clickLink(dataUrl, name);
}

const StratumPrint = registerPlugin<{ print(o: { name: string }): Promise<void> }>("StratumPrint");

/**
 * Print. The Android web view has no window.print(), so the app hands the page
 * to Android's print service (printers and Save as PDF) through its own plugin.
 */
export async function printPage(name = document.title || "Stratum 4D"): Promise<boolean> {
  if (isNativeApp()) {
    try {
      await StratumPrint.print({ name });
    } catch {
      window.alert("Printing needs Stratum 4D 0.9 or later for Android. Meanwhile use File › Export to Excel, Publish Layout as HTML or Export (XER) and share the file.");
      return false;
    }
    // Android lays the page out while its print screen is open, so the caller's print
    // styling must stay until the app is back in front (or two minutes have passed).
    await new Promise<void>((done) => {
      let left = false;
      const t = setTimeout(finish, 120_000);
      function finish() {
        clearTimeout(t);
        document.removeEventListener("visibilitychange", vis);
        window.removeEventListener("focus", back);
        done();
      }
      function vis() {
        if (document.visibilityState === "hidden") left = true;
        else if (left) finish();
      }
      function back() {
        if (left) finish();
      }
      document.addEventListener("visibilitychange", vis);
      window.addEventListener("focus", back);
      window.addEventListener("blur", () => (left = true), { once: true });
    });
    return true;
  }
  window.print();
  return true;
}
