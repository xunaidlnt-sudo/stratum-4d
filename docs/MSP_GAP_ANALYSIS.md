# MS Project layout: gap analysis (0.10)

How the MS Project layout compares with Microsoft Project desktop. "Done" means it works the way MS Project does; "Partial" means a simpler version; "Missing" is not there yet.

## Files

| Feature | Status | Notes |
|---|---|---|
| Open MS Project XML (MSPDI) | Done | Tasks, summaries, links, constraints, deadlines, priority, manual mode, inactive, notes, Baseline–Baseline10, calendars, resources, assignments |
| Save as MS Project XML | Done | Same fields, in schema order; tested round trip on 2,370-task P6 schedules |
| Open .mpp | Missing | Binary, undocumented format. Save as XML from MS Project instead |
| File backstage (Info, New, Open, Save As, Print, Export, Options) | Done | |

## Task editing

| Feature | Status | Notes |
|---|---|---|
| Type into the sheet (name, duration, start, finish, predecessors, resources, % complete, deadline, priority, notes, custom fields) | Done | "5d", "2 wks?", "3FS+2d", "5SS+50%", "Crew[50%]" |
| Blank row adds tasks, Insert, Delete, Cut/Copy/Paste, Undo/Redo | Done | |
| Indent / Outdent, Insert Summary, outline levels | Done | Indenting under a task makes it a summary (its links move off it, as summaries cannot hold links here) |
| Auto / manually scheduled tasks, new-task mode | Done | |
| Milestones, estimated durations, inactive tasks, deadlines | Done | |
| Link / Unlink selected tasks, Respect Links, Move, Mark on Track | Done | |
| Recurring tasks | Done | Daily, weekly, monthly |
| Task Information (all six tabs), Task Form | Done | |
| Split tasks | Missing | Needs task splits in the scheduling engine |
| Effort-driven scheduling, Fixed Work recalculation of units | Partial | Task type is stored and exported; work is not recalculated when units change |
| Links to and from summary tasks | Missing | Stratum links tasks only |

## Views

| View | Status | Notes |
|---|---|---|
| Gantt Chart, Tracking Gantt, Task Sheet | Done | Tables: Entry, Schedule, Tracking, Cost, Variance, Work, Summary, Earned Value |
| Task Usage, Resource Usage | Done | Timephased work by day, week or month; overallocations in red |
| Network Diagram | Done | Read-only layout, boxes and links |
| Calendar | Done | |
| Team Planner | Done | Drag to reassign; no automatic leveling inside the view |
| Resource Sheet, Resource Graph | Done | |
| Timeline | Done | Add to Timeline bars and milestones |
| Custom views and view combinations | Missing | |

## Format and data

| Feature | Status | Notes |
|---|---|---|
| Critical tasks, slack, late tasks, baseline bars, task path | Done | |
| Outline number, project summary task, show/hide summaries | Done | |
| Filter, highlight, group by, sort, add/hide/resize columns | Done | Built-in sets; no custom filter editor |
| Bar Styles and Text Styles dialogs, Gantt Chart Style gallery | Missing | Bar colours follow MS Project's defaults |
| Timescale dialog | Partial | Zoom presets and slider |

## Project

| Feature | Status | Notes |
|---|---|---|
| Project Information, Statistics, Options | Done | |
| Change Working Time (exceptions, work weeks, new calendar) | Done | |
| Set / Clear Baseline 0-10 and interim plans | Done | |
| Update Project, Move Project, Status Date | Done | |
| Custom Fields (with formulas) | Done | |
| Resource leveling (Level All, options, clear, next overallocation) | Done | Leveling order ID / Standard / Priority |
| Subprojects, master projects, resource pools | Missing | |
| Reports gallery | Partial | Uses Stratum dashboards |
