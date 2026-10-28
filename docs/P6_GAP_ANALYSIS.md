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
| User preferences: time units, dates, currency, codes | Done | Time Units, Dates and Currency tabs (symbol and decimals on cost columns) |
| Startup filters, financial periods, resource analysis options | Done | Startup Window preference; Financial Period Calendar with batch create; usage by financial period |
| Wizards | Partial | Setup wizard; no new-activity / new-resource wizards |

## Structuring projects (Pro ch. 4, EPPM "Structuring Projects")

| Topic | Status | Notes |
|---|---|---|
| EPS: structure, add/copy/delete nodes, project status | Done | EPS tree in the Projects window (Set EPS); open any set of projects together, scheduled as one network with cross-project relationships; Commit saves each back |
| OBS | Done | OBS tree, project and WBS responsible managers (inherited down the WBS), Responsible Manager column; imported from XER |
| Resources: add, details, shifts, multiple rates | Done | Rates and max units over time, shifts with per-period limits (used in costs and levelling); imported from XER RSRCRATE |
| Roles: rates and limits over time, assign to activities and resources | Done | General, Resources, Units & Prices (prices and limits over time); role assignments and staffing; Del./Merge |
| Resource curves | Done | 8 standard curves plus custom 21-point curves |
| WBS: add, edit, copy, move, indent | Done | WBS window |
| WBS weighted milestones, categories, status, earned value settings | Done | WBS details: status, anticipated dates, weighted milestones, earned value technique |
| Project codes, resource codes | Done | Project Codes and Resource Codes dictionaries; Project Details › Codes, Resources window columns; imported from XER |
| Global / EPS / project activity codes and colours | Partial | Project-level codes with values, descriptions, colours |
| User-defined fields, data types, indicator UDFs | Partial | Activity UDFs with types and red/yellow/green/blue indicators; no formulas |
| Calendars: project, global, default hours per period | Done | Calendars dialog: work week, holidays, exceptions, hours per day |
| Resource calendars | Done | Calendar per resource, used by levelling; imported from XER |
| Project details: dates, must finish by, status, defaults | Done | General, Dates (anticipated), Defaults (duration/percent/activity type, calendar, Activity ID auto-numbering), Settings, Codes, Summary |

## Developing projects (Pro ch. 5)

| Topic | Status | Notes |
|---|---|---|
| Activities: add, types, duration types, % complete types, calendars, durations, dates | Done | |
| Physical % complete, steps and step weights | Done | Steps tab |
| Activity step templates | Done (0.6) | Save steps as a template, apply to many activities |
| Dissolve, renumber, copy/paste activities | Done | |
| Milestones, float, summaries | Done | |
| Relationships: predecessors, successors, in the Gantt chart | Done | Drag from bar to bar |
| Relationships in the Activity Network | Done | Drag from one box to another to link (FS) |
| Trace Logic | Done | |
| Assign resources, recalc costs | Done | |
| Assign by role, rate types, rate source | Partial | Assign Roles, staff from the Assignments window; one rate type |
| Resource curves on assignments | Done | Spread usage profiles and recalculated costs |
| Budgeting: budget log, funding sources, spending plan | Done | Budgets dialog per WBS: original, changes (approved / pending), distributed, funding, monthly spending and benefit plan against schedule cost |
| Future period bucket planning | Done | Remaining units per future period on each assignment |
| Expenses and expense categories, accrual | Done | Expense Categories dictionary, accrual type, cost accounts; imported from XER PROJCOST |
| Cost accounts | Done | Account tree, default account, assignment and expense booking, roll-up totals |
| Top-down estimation | Done | Total units by WBS weight, spread by remaining duration, for a resource or role |
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
| Apply actuals, store period performance | Done | Store, delete and edit past period actuals; periods named after financial periods |
| Earned value | Done | Activity Usage Profile, dashboards |
| Reflections | Done | Create Reflection, change it, Merge Reflection with a change summary |
| Check out / check in | Out of scope | |
| Schedule, schedule automatically, multiple float paths, critical paths | Done | Schedule Options; "schedule automatically" from 0.6 |
| Check Schedule | Done | DCMA 14-point |
| Level resources, leveling priorities | Partial | Serial levelling by priority |
| Issues: add, responsibility, history | Done | Issues register with a change history and notes |
| Thresholds and threshold monitoring | Done (0.6) | Monitor creates issues |
| Risks: create, assign, respond, scoring matrix | Done | Risks register with score and level from the scoring matrix, heat map |
| Work products and documents | Partial | WPs & Docs register |

## Layouts and views (Pro ch. 7)

| Topic | Status | Notes |
|---|---|---|
| Open, create, save, export and import layouts | Done (0.6) | Export / import as a file |
| Activity table: columns, titles, sort, fonts, row height | Done | Custom column titles from 0.6 |
| Gantt chart: timescale, bars, labels, data date line, relationship lines | Done | |
| Multiple bars with filters, bar styles, legend | Done (0.6) | Bar definitions with timescale, filter, colour, row |
| Curtain and text attachments | Done | Bar Chart Options › Curtains and Text attachments |
| Change dates and durations in the Gantt chart | Done | Drag |
| Progress line | Done | |
| Activity Network: display, layout, box templates | Done | Box template (fields per line, width), drag to link |
| Usage profiles and spreadsheets | Done | |
| Tracking layouts | Partial | Dashboards and Reports |
| Grouping by field, hierarchy, WBS path; band formatting; hide empty bands | Done | Several levels, To Level, grand totals, summaries only, hide if empty, font and colour per level |
| Filters: default, custom, combine, lookahead | Done | Lookahead from 0.6 |
| Summarizing | Out of scope | Summaries are computed live |
| Publish project web site | Partial | Publish layout as HTML |
| Unifier, P6 Visualizer, timescaled logic | Missing / out of scope | |

## Moving data back to P6

| Topic | Status | Notes |
|---|---|---|
| XER export of everything made in Stratum | Done (0.9) | Resources with Price/Unit 1-5 and dated rates, roles, shifts, curves, cost accounts, assignments (rate type, rate source, curve, account), OBS, activity codes with scope and colour, UDFs, steps, notebooks, project and resource codes, expenses, budget log, funding, spending plan. Rows that came from P6 keep their ids and every field Stratum doesn't edit; re-exporting an unchanged XER leaves these tables identical |
| XER import of steps and notebooks | Done (0.9) | TASKPROC and TASKMEMO / MEMOTYPE |

## EPPM web topics

| Topic | Status | Notes |
|---|---|---|
| Portfolios, capacity planning | Done | Project Portfolios; Capacity Planning by resource or role across a portfolio, month by month |
| Team Member status updates, timesheets, email statusing | Out of scope | |
| Workflows, document repository and reviews | Out of scope | |
| Risk scoring matrices, risk thresholds, response plans | Done | Editable 5×5 matrix and thresholds, heat map, response plan steps with owner, dates, cost, status |
| Activity views (web), filters, grouping | Done | Same as the P6 layout |
| Summarizer service, publication services | Out of scope | |
