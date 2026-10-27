# P6 feature gap analysis

Checked against the chapter lists of Oracle's *P6 Professional User's Guide*
(F74771) and *P6 EPPM User's Guide* (G18294). Each line is a topic from those
guides and where Stratum stands. **Done** works in Stratum, **Partial** covers
the main use, **Missing** is not there yet, **Out of scope** depends on Oracle
servers or products Stratum does not have.

Last updated for release 0.6.

## Getting started and the workspace (Pro ch. 2–3)

| Topic | Status | Notes |
|---|---|---|
| Main windows, status bar, layout options bar, hint help | Done | P6 layout: menus, toolbar, Directory and Command bars, status bar |
| Shortcut menus, select multiple items | Done | Right-click menus; Ctrl/Shift-click |
| Enter the same text in multiple rows (Fill Down) | Done | Ctrl+E |
| Copy and paste a range of cells, paste from Excel | Done | Tab-separated cells both ways |
| Hot keys and shortcut keys | Done | Ins, Del, F2, F9, F10, Ctrl+C/X/V/Z/Y/A/E/L/F |
| User preferences: time units, dates, currency, codes | Partial | Durations in days or hours, decimals, date formats, time; currency symbol not yet |
| Startup filters, financial periods, resource analysis options | Missing | |
| Wizards | Partial | Setup wizard; no new-activity / new-resource wizards |

## Structuring projects (Pro ch. 4, EPPM "Structuring Projects")

| Topic | Status | Notes |
|---|---|---|
| EPS: structure, add/copy/delete nodes, project status | Partial | Project database with project list; no EPS tree or several projects open at once |
| OBS | Missing | |
| Resources: add, details, shifts, multiple rates | Partial | Resources window with type, unit, price, max units; no shifts or rates over time |
| Roles: rates and limits over time, assign to activities and resources | Missing | |
| Resource curves | Missing | Units spread evenly |
| WBS: add, edit, copy, move, indent | Done | WBS window |
| WBS weighted milestones, categories, status, earned value settings | Missing | |
| Project codes, resource codes | Missing | Activity codes done |
| Global / EPS / project activity codes and colours | Partial | Project-level codes with values, descriptions, colours |
| User-defined fields, data types, indicator UDFs | Partial | Activity UDFs with types; no indicator icons or formulas |
| Calendars: project, global, default hours per period | Done | Calendars dialog: work week, holidays, exceptions, hours per day |
| Resource calendars | Missing | |
| Project details: dates, must finish by, status, defaults | Partial | Planned start, must finish by, default calendar, name and ID |

## Developing projects (Pro ch. 5)

| Topic | Status | Notes |
|---|---|---|
| Activities: add, types, duration types, % complete types, calendars, durations, dates | Done | |
| Physical % complete, steps and step weights | Done | Steps tab |
| Activity step templates | Done (0.6) | Save steps as a template, apply to many activities |
| Dissolve, renumber, copy/paste activities | Done | |
| Milestones, float, summaries | Done | |
| Relationships: predecessors, successors, in the Gantt chart | Done | Drag from bar to bar |
| Relationships in the Activity Network | Partial | Shown; not drawn there |
| Trace Logic | Done | |
| Assign resources, recalc costs | Done | |
| Assign by role, rate types, rate source | Missing | |
| Resource curves on assignments | Missing | |
| Budgeting: budget log, funding sources, spending plan | Missing | |
| Future period bucket planning | Missing | |
| Expenses and expense categories, accrual | Partial | Expenses register; costs included in cost columns from 0.6 |
| Cost accounts | Missing | |
| Top-down estimation | Missing | |
| Notebooks and notebook topics | Done (0.6) | Notebook tab with topics |
| Global Change: If/Then/Else, arithmetic, combine text | Done | With change report |

## Managing projects (Pro ch. 6)

| Topic | Status | Notes |
|---|---|---|
| Baselines: create, assign, update, copy, delete | Done | Maintain Baselines |
| Primary / secondary / tertiary baselines for comparison | Done (0.6) | BL1–BL3 columns and bars |
| Update progress for all / spotlighted activities, Progress Spotlight | Done | |
| Estimate progress automatically (auto compute actuals) | Done (0.6) | Tools → Estimate Progress |
| Remove progress, suspend / resume | Done (0.6) | |
| Apply actuals, store period performance | Partial | Period actuals stored; no past-period editing |
| Earned value | Done | Activity Usage Profile, dashboards |
| Reflections | Missing | |
| Check out / check in | Out of scope | |
| Schedule, schedule automatically, multiple float paths, critical paths | Done | Schedule Options; "schedule automatically" from 0.6 |
| Check Schedule | Done | DCMA 14-point |
| Level resources, leveling priorities | Partial | Serial levelling by priority |
| Issues: add, responsibility, history | Partial | Issues register |
| Thresholds and threshold monitoring | Done (0.6) | Monitor creates issues |
| Risks: create, assign, respond, scoring matrix | Partial | Risks register |
| Work products and documents | Partial | WPs & Docs register |

## Layouts and views (Pro ch. 7)

| Topic | Status | Notes |
|---|---|---|
| Open, create, save, export and import layouts | Done (0.6) | Export / import as a file |
| Activity table: columns, titles, sort, fonts, row height | Done | Custom column titles from 0.6 |
| Gantt chart: timescale, bars, labels, data date line, relationship lines | Done | |
| Multiple bars with filters, bar styles, legend | Done (0.6) | Bar definitions with timescale, filter, colour, row |
| Curtain and text attachments | Missing | |
| Change dates and durations in the Gantt chart | Done | Drag |
| Progress line | Done | |
| Activity Network: display, layout, box templates | Partial | Canvas network; fixed box layout |
| Usage profiles and spreadsheets | Done | |
| Tracking layouts | Partial | Dashboards and Reports |
| Grouping by field, hierarchy, WBS path; band formatting; hide empty bands | Partial | Field and WBS grouping; WBS-path labels from 0.6 |
| Filters: default, custom, combine, lookahead | Done | Lookahead from 0.6 |
| Summarizing | Out of scope | Summaries are computed live |
| Publish project web site | Partial | Publish layout as HTML |
| Unifier, P6 Visualizer, timescaled logic | Missing / out of scope | |

## EPPM web topics

| Topic | Status | Notes |
|---|---|---|
| Portfolios, capacity planning | Partial | Portfolio rows in dashboards |
| Team Member status updates, timesheets, email statusing | Out of scope | |
| Workflows, document repository and reviews | Out of scope | |
| Risk scoring matrices, risk thresholds, response plans | Missing | |
| Activity views (web), filters, grouping | Done | Same as the P6 layout |
| Summarizer service, publication services | Out of scope | |
