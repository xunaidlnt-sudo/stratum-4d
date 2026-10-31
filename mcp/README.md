# Stratum 4D MCP server

This server lets an AI assistant work with your schedules: Claude Desktop, Claude Code, or any other app that supports the Model Context Protocol (MCP). You ask in plain words, for example "open last week's XER and tell me what slipped", and the assistant calls Stratum's own engine to answer.

It runs on your computer. It reads files and the Stratum 4D desktop database on this computer and sends nothing anywhere else. The assistant app shows you each tool call before it runs, unless you allow the tool permanently.

## What it can do

| Tool | What it does |
|---|---|
| `open_file` | Open a P6 `.xer`, an MS Project `.xml` or a `.stratum.json` file |
| `list_projects`, `open_project` | List and open projects in the Stratum 4D desktop database |
| `summary`, `list_open` | Dates, counts, status and critical activities of an open schedule |
| `list_activities`, `get_activity` | Find activities by text, status, dates or float; full detail with logic, resources and notes |
| `schedule` | Run the scheduler (F9), with a new data date if you give one |
| `critical_path`, `lookahead` | The critical path; what starts or finishes in the next N days |
| `kpis`, `kpi_activities` | SPI, CPI, BEI, finish variance, DCMA-style checks, and the activities behind each count |
| `check_schedule` | Schedule quality check: missing logic, constraints, negative float, long durations and more |
| `compare` | What changed between two schedules: added, deleted and changed activities, logic, finish movement |
| `update_activity`, `update_progress` | Record progress on one activity, or update everything as planned to a new data date |
| `export` | Write P6 XER, MS Project XML, CSV or a Stratum project file |
| `save_project` | Save back to the Stratum 4D database (as a new version; refused if someone saved in the meantime) |

## Install

You need **Node.js 20 or newer** (nodejs.org).

1. Download `Stratum-4D-<version>-mcp.zip` from the release page: <https://github.com/xunaidlnt-sudo/stratum-4d/releases/latest>.
2. Unzip it to a folder you keep, for example `C:\Stratum\mcp` or `~/stratum-mcp`. Keep `stratum-mcp.cjs` and `sql-wasm.wasm` together.

### Claude Desktop

1. Open Claude Desktop › **Settings › Developer › Edit Config**. This opens `claude_desktop_config.json`.
2. Add the server (use your own path; on Windows write `\\` for each `\`):

```json
{
  "mcpServers": {
    "stratum-4d": {
      "command": "node",
      "args": ["C:\\Stratum\\mcp\\stratum-mcp.cjs"]
    }
  }
}
```

3. Restart Claude Desktop. The tools icon in the chat box lists the Stratum tools.

### Claude Code

```bash
claude mcp add stratum-4d -- node /path/to/stratum-mcp.cjs
```

Add `--scope user` to have it in every project.

### Other MCP clients

Run `node stratum-mcp.cjs` as a stdio server.

## The project database

The server finds the Stratum 4D desktop database here:

| System | File |
|---|---|
| Windows | `%APPDATA%\Stratum 4D\stratum.db` |
| macOS | `~/Library/Application Support/Stratum 4D/stratum.db` |
| Linux | `~/.config/Stratum 4D/stratum.db` |

To use another file, set `STRATUM_DB`, for example in the Claude Desktop config:

```json
"stratum-4d": { "command": "node", "args": ["…/stratum-mcp.cjs"], "env": { "STRATUM_DB": "D:\\Projects\\stratum.db" } }
```

Reading is safe while the desktop app is open. Close the desktop app before you ask the assistant to **save** a project, so the two do not write to the database at the same time.

## Things to ask

- "Open `C:\Schedules\N-20016 Update 12.xer`. What is the finish date, and which activities are on the critical path?"
- "Compare update 11 and update 12. Which activities slipped more than 5 days, and why?"
- "Run a schedule check and list the open activities without a successor."
- "Give me a three-week look-ahead for the civil works."
- "Mark C-4010 as 60% complete with an actual start of 3 November, update progress to 10 November, reschedule and export an XER."

## Build from source

```bash
npm install
npm run build:mcp      # → mcp/dist/stratum-mcp.cjs and sql-wasm.wasm
```
