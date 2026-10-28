// Tools › Publish › Project Web Site: choose the topics, then download the
// site as a zip to unpack on a web server, SharePoint or a shared drive.

import { strToU8, zipSync } from "fflate";
import { useState } from "react";
import { projectWebsite, SITE_TOPICS, type SiteTopic } from "../../core/website";
import { download } from "../files";
import { useStore } from "../store";
import { closeDlg, P6Dlg, SideBtn, SideGap, SideHelp } from "./P6Dlg";

export function PublishSiteDialog() {
  const s = useStore((x) => x.schedule);
  const [title, setTitle] = useState(s ? `${s.projectCode} – ${s.projectName}` : "");
  const [description, setDescription] = useState("");
  const [topics, setTopics] = useState<SiteTopic[]>(SITE_TOPICS.map(([t]) => t));
  const [theme, setTheme] = useState<"classic" | "light">("classic");
  const [by, setBy] = useState("");
  if (!s) return null;
  const publish = () => {
    const files = projectWebsite(s, { title: title.trim() || s.projectName, description: description.trim() || undefined, topics, theme, publishedBy: by.trim() || undefined });
    const folder = `${s.projectCode.replace(/[^\w.-]+/g, "_")}-website`;
    const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [`${folder}/${k}`, strToU8(v)])), { level: 6 });
    download(`${folder}.zip`, zip, "application/zip");
    useStore.getState().setStatus(`Published ${Object.keys(files).length - 1} pages to ${folder}.zip. Unzip it and open index.html, or copy the folder to a web server or SharePoint library.`);
    closeDlg();
  };
  return (
    <P6Dlg
      title="Publish Project Web Site"
      width={640}
      onClose={closeDlg}
      side={
        <>
          <SideBtn kind="run" label="Publish" primary onClick={publish} />
          <SideBtn kind="cancel" label="Cancel" onClick={closeDlg} />
          <SideGap />
          <SideHelp topic="publish-website" />
        </>
      }
    >
      <div className="stack">
        <label>
          Web site name
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Web site description
          <textarea rows={3} value={description} placeholder="Shown on the overview page" onChange={(e) => setDescription(e.target.value)} />
        </label>
        <fieldset className="p6-fieldset">
          <legend>Topics</legend>
          {SITE_TOPICS.map(([t, l]) => (
            <label key={t} className="p6-check">
              <input type="checkbox" checked={topics.includes(t)} onChange={(e) => setTopics(e.target.checked ? [...topics, t] : topics.filter((x) => x !== t))} /> {l}
            </label>
          ))}
          <span className="muted small">The project overview page is always included.</span>
        </fieldset>
        <div className="grid2">
          <label>
            Theme
            <select value={theme} onChange={(e) => setTheme(e.target.value as "classic" | "light")}>
              <option value="classic">P6 classic</option>
              <option value="light">Light</option>
            </select>
          </label>
          <label>
            Published by (optional)
            <input value={by} onChange={(e) => setBy(e.target.value)} />
          </label>
        </div>
        <p className="muted small">The site is plain HTML with no scripts: one page per topic, a shared stylesheet and relative links. It downloads as a zip.</p>
      </div>
    </P6Dlg>
  );
}
