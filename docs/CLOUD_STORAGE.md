# Working from a Google Drive or OneDrive folder

Stratum can keep its projects in a shared cloud folder instead of one
browser. Everyone you give **edit access** to the folder opens and saves the
same projects, EPS, portfolios and project codes, from the website, the
desktop or a tablet.

How it works:

- Each project is one file (`<id>.stratum.json`). `stratum-catalog.json`
  lists the projects with a version number; `stratum-shared.json` holds the
  EPS, portfolios, project codes and EPS managers; dashboards are
  `dashboard-<id>.json`.
- Opening a project reads its file. **Commit** writes it and raises the
  version. If a colleague committed the same project after you opened it,
  your commit is stopped and you are told who saved it and when; use
  *Save as New* to keep your version, or reopen theirs. Nobody overwrites
  anyone without knowing.
- Two people cannot edit the same project live. For parallel work, give each
  person a **reflection** (Projects window › Create Reflection) and merge them
  back.
- Email reports, report schedules and P6 connections are not available from a
  cloud folder (they need the Stratum Server or the desktop app).

The two set-ups below are free and done once, by one person. They give the
website permission to ask users to sign in. Client IDs are not secrets.

## Google Drive

1. Open <https://console.cloud.google.com/> and sign in with the Google
   account that will own the app. Top bar › project list › **New project**,
   name it `Stratum 4D`, **Create**, and select it.
2. **APIs & Services › Library** › search **Google Drive API** › **Enable**.
3. **APIs & Services › OAuth consent screen** (or *Google Auth Platform ›
   Branding*):
   - User type **External** (or **Internal** for a Google Workspace company).
   - App name `Stratum 4D`, your support email, developer email. Save.
   - **Data access / Scopes** › *Add or remove scopes* › tick
     `.../auth/drive` (See, edit, create and delete all of your Google Drive
     files). Save.
   - **Audience / Test users** › add the Google accounts of everyone on the
     team (up to 100). While the app is in *Testing* only these accounts can
     sign in; Google shows an "unverified app" notice, which is expected.
4. **APIs & Services › Credentials › Create credentials › OAuth client ID**:
   - Application type **Web application**, name `Stratum 4D web`.
   - **Authorized JavaScript origins** › add
     `https://xunaidlnt-sudo.github.io` (and `http://localhost:5173` if you
     run Stratum locally).
   - No redirect URIs are needed. **Create** and copy the **Client ID**
     (`…apps.googleusercontent.com`).

## OneDrive (Microsoft 365 or personal)

1. Open <https://entra.microsoft.com/> (or <https://portal.azure.com/> ›
   *Microsoft Entra ID*) and sign in. **App registrations › New
   registration**:
   - Name `Stratum 4D`.
   - Supported account types: **Accounts in any organizational directory and
     personal Microsoft accounts** (or only your organisation).
   - Redirect URI: platform **Single-page application (SPA)**, URI
     `https://xunaidlnt-sudo.github.io/stratum-4d/auth.html`
     (add `http://localhost:5173/auth.html` too for local use).
   - **Register**, then copy the **Application (client) ID** from Overview.
2. **API permissions › Add a permission › Microsoft Graph › Delegated
   permissions** › tick **Files.ReadWrite.All** and **User.Read** › *Add
   permissions*. In many company tenants an administrator must click **Grant
   admin consent**; otherwise users can consent themselves at first sign-in.

## Connect Stratum

1. Open Stratum › **Admin › Preferences… › Data** (Settings › Data).
2. Under *Use a Google Drive or OneDrive folder*, pick the provider, paste the
   client ID, and click **Sign in**. A popup asks for your account.
3. Browse to the shared folder (*Shared with me* lists folders colleagues
   shared with you) or create one with **Create "Stratum 4D" folder here**,
   then **Use … as the Stratum folder**.
4. Optional: **Copy this browser's projects to the folder**.
5. Share the folder from Google Drive or OneDrive with your team, with
   **Editor** access. Each colleague does steps 1–3 and picks that folder from
   *Shared with me*.

To save colleagues pasting the IDs: in GitHub, **Settings › Secrets and
variables › Actions › Variables**, add `GOOGLE_CLIENT_ID` and/or
`MS_CLIENT_ID`. The website is rebuilt with them on the next push and the
fields fill in by themselves.

## Tablets and phones

Google does not allow its sign-in inside embedded app web views, so use the
website as an installed app on Android: open the website in **Chrome**, menu ›
**Install app** (or *Add to Home screen*). It opens full screen like an app,
keeps working offline for viewing, and signs in to Google Drive or OneDrive
normally. The APK from the Releases page remains for offline, single-device
use.

The desktop app (Windows/macOS/Linux) keeps its own local database; to work in
the shared folder from a computer, use the website.
