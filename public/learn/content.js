/* ============================================================================
   PLANNING & CONTROLS COURSE — content.js (from Planner's Guild)
   All teaching content, questions, challenges and boss data.
   Pure data. No DOM access. Loaded before widgets.js and game.js.

   LESSON BLOCK SCHEMA (rendered by game.js:renderBlocks)
     {h:"heading"}                     section heading
     {p:"paragraph <b>html allowed</b>"}
     {ul:["item","item"]}  {ol:[...]}  lists
     {tbl:[[headers],[[row],[row]]]}   data table
     {ok:["Title","body"]}             green callout — good practice
     {warn:["Title","body"]}           red callout — trap / error
     {tip:["Title","body"]}            amber callout — practitioner tip
     {def:["Term","meaning"]}          violet callout — definition
     {say:["Speaker","quote"]}         teal callout — voice from the field
     {fx:"formula text"}               monospace formula block
     {w:"widgetId"}                    mounts an interactive tool

   CHECK SCHEMA
     {type:"mcq", q, opts:[], a:index, hint, why}
     {type:"calc", q, a:number, tol:number, unit, hint, why}
   ========================================================================== */

/* ---------------------------------------------------------------- ranks -- */
var RANKS = [
  {xp:0,    name:"Planning Trainee",          note:"Level 1 lessons unlocked"},
  {xp:500,  name:"Junior Planner",            note:"You can read a programme"},
  {xp:1200, name:"Planning Engineer",         note:"Level 2 unlocked (after Boss 1)"},
  {xp:2400, name:"Senior Planning Engineer",  note:"Level 3 unlocked (after Boss 2)"},
  {xp:4000, name:"Lead Planner",              note:"You can defend a programme"},
  {xp:6000, name:"Planning Manager",          note:"Level 4 unlocked (after Boss 3)"},
  {xp:8500, name:"Head of Project Controls",  note:"Certificate + Master Challenge"}
];

/* --------------------------------------------------------------- badges -- */
/* Every badge is earned by a measurable demonstration of skill.
   `code` is checked by game.js:checkBadges against the save state.       */
var BADGES = [
  {id:"float",     n:"Float Master",         d:"100% on every float calculation challenge in the game."},
  {id:"paths",     n:"Path Finder",          d:"Correctly identify the critical path in 5 different networks."},
  {id:"auditor",   n:"The Auditor",          d:"Find every seeded defect in a Spot-the-Defect board with zero false positives."},
  {id:"cost",      n:"Cost Whisperer",       d:"Answer 10 consecutive earned value questions correctly."},
  {id:"timelord",  n:"Time Lord",            d:"Complete the Earned Schedule challenge in under 90 seconds."},
  {id:"claim",     n:"Claim Builder",        d:"Defeat Boss 4 — The Claim — without losing a single heart."},
  {id:"frontload", n:"Front-Load Detector",  d:"Classify 8 out of 8 S-curve shapes correctly."},
  {id:"calpedant", n:"Calendar Pedant",      d:"Build 5 calendars correctly on the first attempt."},
  {id:"noshort",   n:"No Shortcuts",         d:"Finish an entire level without revealing a single answer."},
  {id:"comeback",  n:"Comeback",             d:"Defeat a boss you previously lost to."},
  {id:"seven",     n:"Seven Days",           d:"Earn XP on 7 consecutive calendar days."},
  {id:"thirty",    n:"Thirty Days",          d:"Earn XP on 30 consecutive calendar days."},
  {id:"perfect",   n:"Perfectionist",        d:"100% first-attempt on every check-yourself question in a level."},
  {id:"logician",  n:"Logician",             d:"Score full marks on all four relationship-type challenges."},
  {id:"dcma",      n:"Fourteen Points",      d:"Run the DCMA checker challenge and call every failing test correctly."},
  {id:"pert",      n:"Three Point Turn",     d:"Complete the PERT challenge without a hint."},
  {id:"crasher",   n:"The Crasher",          d:"Hit the crash-optimiser target on the first submission."},
  {id:"forensic",  n:"Forensic Mind",        d:"Choose the defensible delay-analysis method in every Decision Scenario."},
  {id:"sequencer", n:"Right Order",          d:"Complete all five Sequence Builders with no misplaced item."},
  {id:"guild",     n:"Guild Master",         d:"Pass the Master Challenge."}
];

/* --------------------------------------------------------------- levels -- */
var LEVELS = [
  {n:1, key:"l1", title:"Foundations",              rank:"Planning Trainee",
   blurb:"What a plan is, how scope becomes activities, how logic becomes a network, and how the network tells you the date."},
  {n:2, key:"l2", title:"Building the Schedule",    rank:"Planning Engineer",
   blurb:"Schedule levels, baselines, resource and cost loading, weightage, updating and reporting."},
  {n:3, key:"l3", title:"Measure and Control",      rank:"Senior Planning Engineer",
   blurb:"Earned value, earned schedule, schedule quality, risk and contingency, and how to recover."},
  {n:4, key:"l4", title:"Commercial and Forensic",  rank:"Planning Manager",
   blurb:"Contracts, delay analysis, concurrency, disruption and how an extension of time claim is actually won."}
];

/* ========================================================================== *
 *  LEVEL 1 — FOUNDATIONS
 * ========================================================================== */
var LESSONS = [

{id:"L1", lvl:1, t:"What planning actually is",
 sub:"Plan versus schedule, the seven responsibilities, the lifecycle, and which side of the table you sit on",
 body:[
  {p:"Most people entering project controls believe planning means building a bar chart. It does not. The bar chart is an <b>output</b>. Planning is the discipline of deciding how work will be executed, then measuring reality against that decision honestly enough that someone can act on the difference. If you only ever produce a chart, you are a schedule typist. If you produce a decision, you are a planner."},

  {h:"Plan versus schedule"},
  {p:"These two words are used interchangeably on site and they should not be. The <b>plan</b> is the strategy: we will energise the 220kV side before the 33kV side because the client needs back-feed for commissioning; we will build the control building early because it houses the protection panels; we will procure the GIS first because it has a 14-month lead time. The plan is a set of choices about sequence, method, resources and risk."},
  {p:"The <b>schedule</b> is the plan expressed in dates. It is the arithmetic that falls out once you commit the plan to durations, logic and calendars. A schedule with no plan behind it is a fiction — it will have dates, and the dates will be indefensible, because nobody can tell you why activity B follows activity A."},
  {say:["A project director, EPC substation package","If you cannot explain your programme without opening it, you did not plan it. You drew it."]},

  {h:"The seven responsibilities of a planner"},
  {p:"Across contractor and client organisations, the role reduces to seven duties. Everything else is a variation of one of these."},
  {ol:[
   "<b>Define the work.</b> Turn contract scope into a work breakdown structure and then into activities that a foreman would recognise.",
   "<b>Sequence it.</b> Establish logic that reflects how the work will physically be built, not how it looks tidy on a page.",
   "<b>Estimate it.</b> Durations derived from quantity, productivity and crew size — not from the finish date working backwards.",
   "<b>Baseline it.</b> Get the programme accepted, frozen and used as the measuring stick.",
   "<b>Measure it.</b> Collect progress against a defined rule of credit, not against opinion.",
   "<b>Forecast it.</b> Say what the completion date and cost will be, and be willing to be wrong in public.",
   "<b>Protect it.</b> Record delay events as they happen so entitlement survives contact with a claim two years later."
  ]},
  {tip:["Duty seven is the one that pays for the department","A planning department costs a large EPC contractor perhaps 0.4% of turnover. A single well-recorded extension of time on a substation package can recover more than the department costs for a decade. Records made contemporaneously are worth many times the same records reconstructed later."]},

  {h:"The project lifecycle and where planning bites"},
  {p:"Planning does not have equal weight throughout a project. Its influence is highest at the start, when almost nothing has been spent and everything is still a choice, and its influence decays as commitments are made. Its <i>workload</i>, unhelpfully, runs the other way — the busiest planning months are during execution, when your ability to change the outcome is already reduced."},
  {tbl:[["Phase","What planning produces","Real leverage"],[
   ["Tender / bid","Level 1–2 bid programme, method statement alignment, preliminaries duration","Very high — the duration you bid becomes the duration you own"],
   ["Award / mobilisation","Level 3 baseline, WBS, resource and cost loading","Very high"],
   ["Engineering &amp; procurement","Long-lead tracking, deliverable registers, look-aheads","High"],
   ["Construction","Updates, progress measurement, short-interval plans, delay register","Moderate"],
   ["Testing &amp; commissioning","System-based sequencing, energisation windows, punch clearance","Moderate"],
   ["Close-out","As-built programme, final account support, claim substantiation","Low on the outcome, high on the money"]
  ]]},

  {h:"Two chairs: contractor and client"},
  {p:"The same technical skills point in opposite directions depending on who employs you, and it is worth being honest about that early."},
  {p:"On the <b>contractor</b> side you build the programme. Your job is to produce a schedule that is achievable, that protects the contractor's float, that demonstrates compliance with the contract, and that documents every event for which the client is responsible. You are simultaneously a production planner and, quietly, an evidence collector."},
  {p:"On the <b>client, PMC or engineer</b> side you review the programme. Your job is to establish whether the submitted programme is a credible representation of how the work will be built, whether the progress claimed is real, and whether a claimed delay is actually the client's responsibility. You will spend more time auditing than drawing."},
  {ok:["The transferable core","Both chairs need the same technical foundation: CPM, float, calendars, earned value and the contract. What changes is which direction you point it. Planners who have sat in both chairs are consistently better than those who have sat in one, because they know what the other side is looking for."]},

  {h:"Why this discipline gets a bad reputation"},
  {p:"Planning earns contempt on projects when the programme becomes decorative — updated monthly for a report, never used to make a decision, and quietly ignored by the people building the work. That happens for predictable reasons: activities too coarse to steer with, logic that does not reflect the method, progress claimed on percentages nobody can verify, and a finish date that never moves no matter what happens on site."},
  {p:"A programme is working when the construction manager opens it to argue with you. That argument is the product."},
  {warn:["The single most common failure","A schedule whose finish date does not move when the project is genuinely late. This happens when logic is broken by constraints, when progress is claimed on duration rather than physical work, or when remaining durations are never re-judged. A programme that cannot report bad news is worse than no programme, because it manufactures false confidence."]}
 ],
 check:{type:"mcq",
  q:"A contractor's monthly programme update has shown the same contract completion date for six consecutive months. In the same period, structural steel erection has slipped by seven weeks and is on the longest path. Which explanation should you investigate <i>first</i>?",
  opts:[
   "The contractor has genuinely recovered the delay through acceleration",
   "The steel activities are not actually driving the completion date because a constraint or broken logic is absorbing the slip",
   "The client has granted an extension of time that has been incorporated",
   "The reporting period is too short for the slip to appear"
  ],
  a:1,
  hint:"If an activity is on the longest path and slips, arithmetic says the finish must move. If it does not move, the arithmetic is being prevented from working. What prevents it?",
  why:"A slip on the longest path must push the finish unless something is stopping the calculation propagating — most often a mandatory or 'finish on' constraint on a downstream milestone, an open end, or logic that was quietly changed during the update. Acceleration (a) is possible but is the rarer answer and would show as changed durations or added resources you could see. An EOT (c) would move the contract date, not hide the slip. Always test the arithmetic before believing the narrative."}
},

{id:"L2", lvl:1, t:"Scope and the WBS",
 sub:"Deliverable-oriented decomposition, the 100% rule, work packages, control accounts and the WBS dictionary",
 body:[
  {p:"Every failure of scope control traces back to the same root: somebody was asked to schedule work that had never been properly defined. The work breakdown structure is the instrument that defines it. It is not a folder tree for tidiness — it is the skeleton that cost, schedule, progress, risk and reporting all hang from, and if it is wrong, every number downstream is wrong in the same way."},

  {h:"Deliverable-oriented, not activity-oriented"},
  {p:"A WBS decomposes the project into <b>things that will exist</b>, not into <b>things people will do</b>. The distinction matters because deliverables are stable and verifiable while actions are neither."},
  {tbl:[["Wrong (action-oriented)","Right (deliverable-oriented)"],[
   ["Excavate, Reinforce, Pour, Cure","Transformer Foundation T1"],
   ["Design, Review, Approve, Issue","Protection &amp; Control Philosophy Document"],
   ["Install, Test, Commission","220kV GIS Bay Q01"]
  ]]},
  {p:"Under <span class=\"mono\">220kV GIS Bay Q01</span> you will still have activities called erect, align, gas-fill, HV test. But the bay is the deliverable. It can be pointed at, inspected and handed over. \"Install\" cannot."},
  {def:["Work Breakdown Structure","A hierarchical decomposition of the total scope of work to be carried out by the project team to accomplish the project objectives and create the required deliverables. Each descending level represents an increasingly detailed definition of the work."]},

  {h:"The 100% rule"},
  {p:"This is the only rule of WBS construction that is genuinely non-negotiable. <b>The children of any parent must sum to exactly 100% of the parent — no more and no less.</b>"},
  {p:"Two failure modes follow from breaking it. If the children sum to less than the parent, scope has fallen through the floor: work exists in the contract that exists nowhere in your programme, and it will appear as a surprise around month nine. If the children sum to more than the parent, you have double-counted, and your progress will be flattering and wrong."},
  {fx:"Parent = Σ children,  exactly.\n\n220kV Substation (100%)\n  ├─ Civil works          32%\n  ├─ GIS &amp; equipment      41%\n  ├─ Protection &amp; control 14%\n  └─ Testing &amp; commissioning 13%\n                        ────\n                        100%"},
  {warn:["The rule applies to scope, not to cost weighting","Do not confuse the 100% rule with weightage. The 100% rule says the <i>scope</i> of the children equals the scope of the parent. Weightage says how much each child counts toward progress. They use the same tree but they are different statements — you can get weightage wrong while the 100% rule still holds."]},

  {h:"Work packages, control accounts and the sizing question"},
  {p:"The bottom of the WBS is the <b>work package</b>: the lowest element you plan, cost and control. Above it sits the <b>control account</b>, the point where scope, budget and schedule are integrated and where earned value is actually measured. A control account typically contains several work packages and has one accountable owner."},
  {p:"How far down should you go? A workable heuristic used across EPC is that a work package should represent roughly <b>0.5% to 2% of total project value</b>. Below 0.5% you generate administration nobody reads; above 2% you cannot tell what is wrong when the package reports 60%."},
  {p:"On a project of AED 300 million, that band puts a work package between AED 1.5 million and AED 6 million. On a AED 20 million package, the same band gives AED 100,000 to AED 400,000. The percentage travels; the absolute number does not."},
  {w:"wbs"},

  {h:"WBS, CBS and OBS"},
  {p:"Three structures cut the same project three ways, and confusing them is a common interview failure."},
  {tbl:[["Structure","Answers","Owned by"],[
   ["WBS — Work Breakdown","<b>What</b> is being delivered","Project / planning"],
   ["CBS — Cost Breakdown","<b>How</b> the money is classified (labour, material, subcontract, plant)","Cost control / finance"],
   ["OBS — Organisational Breakdown","<b>Who</b> is accountable","Project management"]
  ]]},
  {p:"The control account is precisely the <b>intersection</b> of a WBS element and an OBS element. That is what makes it controllable: a defined piece of scope with a named owner. If you cannot name the owner, you do not have a control account, you have a wish."},

  {h:"The WBS dictionary"},
  {p:"The tree alone is ambiguous. <span class=\"mono\">Control Building</span> means nothing until someone writes down whether it includes the HVAC, the false flooring, the cable trenches to the switchyard and the fire suppression. The <b>WBS dictionary</b> records, for each element: the scope included, the scope explicitly excluded, the responsible party, the budget, the acceptance criteria and the linked contract clause or BOQ items."},
  {ok:["Where disputes are actually prevented","The exclusion lines matter more than the inclusion lines. Most scope disputes are not about work that both parties agree exists — they are about work that each party assumed the other had. Writing 'excludes: cable trench beyond gantry line' costs you thirty seconds and can save a variation argument."]},
  {tip:["Build the WBS before the schedule, always","Planners under time pressure open the scheduling tool and start typing activities. The result is a flat list that cannot be rolled up, cannot be reported by area, and cannot be cost loaded without rework. Two days on the WBS saves three weeks later. This is the single highest-return habit in the discipline."]}
 ],
 check:{type:"mcq",
  q:"A project worth AED 240 million has a WBS whose lowest level contains 18 work packages. The largest is AED 31 million and the smallest is AED 0.9 million. What is the primary control problem?",
  opts:[
   "The smallest package is below the 0.5% guideline and creates unnecessary administration",
   "The largest package is about 13% of project value, so when it reports a problem you cannot tell which part of it is failing",
   "18 work packages is too few for a project of this size regardless of their values",
   "The packages are unevenly sized, which breaks the 100% rule"
  ],
  a:1,
  hint:"Work out each package as a percentage of AED 240 million, then ask which one you could not diagnose if it reported 55% complete and slipping.",
  why:"AED 31m is 12.9% of project value — far above the 0.5–2% guidance. When an oversized package reports trouble you have no visibility into which portion of it is failing, so you cannot act. The AED 0.9m package is 0.375%, marginally small but harmless. Option (d) is wrong on the theory: the 100% rule concerns whether children sum to the parent's scope, not whether they are equally sized. Option (c) mistakes a symptom for the rule — the count follows from the sizing, not the other way round."}
},

{id:"L3", lvl:1, t:"Activities, durations and estimating",
 sub:"Four estimating methods, effort versus duration, the 44-day rule, level of effort, and why padding destroys control",
 body:[
  {p:"A duration is a prediction, and like all predictions it can be derived or invented. Derived durations can be defended, adjusted and learned from. Invented durations cannot, which is why an interviewer asking \"how did you get 45 days?\" is not being difficult — they are testing whether you have a method."},

  {h:"The four estimating methods"},
  {p:"<b>1. Productivity-based (bottom-up).</b> The default, and the only one that is genuinely defensible on construction work. Quantity divided by crew output gives you duration directly."},
  {fx:"Duration = Quantity ÷ (Crew output per day)\n\nCable pulling, 33kV XLPE 3×240mm²:\n  Quantity      = 4,800 m\n  Crew output   =   160 m/day (one pulling crew)\n  Duration      = 4,800 ÷ 160 = <b>30 working days</b>\n\nAdd a second crew working an independent route:\n  Duration      = 4,800 ÷ 320 = <b>15 working days</b>"},
  {p:"Notice what this gives you that a guess does not: if the client asks you to compress, you can say precisely what it costs — a second crew, and you can point to whether the route allows two crews to work without interference. That last clause is where inexperienced planners go wrong, because output does not scale linearly once crews start tripping over each other."},
  {p:"<b>2. Analogous (top-down).</b> Take the actual duration from a comparable completed project and adjust. Fast, low accuracy, appropriate at tender when no quantities exist. \"Ajban 220/33kV took 26 months; this one has two more bays and a harder interface, call it 29.\" It is a legitimate method at Level 1, and indefensible at Level 3."},
  {p:"<b>3. Parametric.</b> A statistical relationship between a driver and a duration, calibrated from your own historical data. Engineering hours per drawing, days per bay, hours per weld diameter-inch. Powerful where you have a real dataset. Dangerous where you have borrowed someone else's."},
  {p:"<b>4. Expert judgement.</b> The commissioning manager tells you the 220kV protection scheme takes eleven days to test. Use it — but write down who said it and when, because in fourteen months you will need to know whose number you carried."},
  {warn:["Never estimate backwards from the contract date","Taking the required finish date and distributing the remaining time across activities is the most common cause of unachievable programmes. It produces durations with no basis, and it hides the fact that the contract duration may be genuinely insufficient — which is information the project needs at month one, not month twenty."]},

  {h:"Effort is not duration"},
  {p:"These are different quantities and mixing them produces silent errors."},
  {fx:"Effort   = 240 man-hours (the work content)\nCrew     = 4 persons × 10 hours/day = 40 man-hours/day\nDuration = 240 ÷ 40 = <b>6 days</b>\n\nSame effort, crew of 8:\nDuration = 240 ÷ 80 = <b>3 days</b>   — effort unchanged, duration halved"},
  {p:"Effort is a property of the work. Duration is a property of the work <i>and</i> the resources you assign <i>and</i> the calendar those resources follow. Change the crew and the duration changes while the effort does not. This is why resource-loaded schedules are more honest than date-only schedules: they make the assumption visible."},
  {p:"It also has a hard limit. Some work is not divisible — concrete curing takes the time it takes regardless of how many people watch it, and a 24-hour HV withstand test is 24 hours with one engineer or six."},

  {h:"The 44-day rule"},
  {p:"The DCMA 14-point assessment flags any activity with a <b>baseline duration greater than 44 working days</b>. Forty-four working days is roughly two calendar months on a five-day week, and the threshold is not arbitrary — it is the point beyond which an activity stops being controllable."},
  {p:"Three things break on a long activity. You cannot verify progress on it, because there is no intermediate deliverable to inspect — you get 40%, then 55%, then 60%, then 60% again. It masks internal logic, because inside a 90-day \"Install Cable Trays\" activity there is a real sequence that the network can no longer see or calculate. And it cannot be recovered, because by the time you detect the slip most of the duration is spent."},
  {tip:["The threshold is a trigger, not a prohibition","Some activities are legitimately long: a 120-day manufacturing period for a power transformer, or a 90-day statutory approval. Do not chop them artificially. The correct response is to justify them in the basis of schedule — the DCMA tests are designed to make you explain yourself, not to be passed blindly."]},

  {h:"Level of effort and the trap it sets"},
  {def:["Level of Effort (LOE)","Support-type work that has no discrete deliverable of its own and is consumed at a steady rate over a period — site management, quality assurance, the planning function itself, site accommodation."]},
  {p:"LOE activities earn value purely by the passage of time. That makes them dangerous in earned value terms: if you put a large budget into LOE, your project will report progress simply for existing. A project that is 40% through its duration having built nothing will show meaningful earned value if 25% of the budget sits in LOE."},
  {ok:["Keep LOE small and visible","Keep LOE below roughly 5–10% of total budget, keep it in its own WBS branch so it can be excluded from analysis, and never let a discrete deliverable be reclassified as LOE because it is difficult to measure. Difficulty of measurement is not a reason to stop measuring."]},

  {h:"Why padding destroys control"},
  {p:"A foreman who needs 10 days asks for 15 because he has been burned before. That is rational behaviour at the individual level and destructive at the project level, for three reasons."},
  {ul:[
   "<b>The float is invisible.</b> Contingency hidden inside durations cannot be managed, reallocated or reported. Held centrally as an identified buffer, it can be.",
   "<b>Parkinson's law.</b> Work expands to fill the time available. The 15-day activity will finish on day 15, not day 10.",
   "<b>The student syndrome.</b> Slack at the front of an activity gets consumed before work starts, so the pad protects nothing — it is spent before the risk it was meant to cover arrives."
  ]},
  {p:"The professional position is: estimate to a realistic and stated confidence level — commonly around P50 for individual activities — and hold contingency explicitly at project level where it can be governed. This is covered properly when we reach risk and PERT."},
  {say:["A planning manager, transmission EPC","I will take a 10-day estimate and a stated risk over a 15-day estimate and a shrug. The first one I can manage. The second one is just somebody's anxiety converted into a bar."]}
 ],
 check:{type:"calc",
  q:"You must place 3,600 m³ of concrete. One pour crew achieves 90 m³ per day. The client asks you to complete it in 20 working days and the site can physically accommodate three independent pour locations without interference. <b>How many crews do you need?</b> Enter a whole number.",
  a:2, tol:0.01, unit:"crews",
  hint:"First find the duration with one crew, then work out what divisor brings it to 20 days or fewer. You cannot mobilise a fraction of a crew.",
  why:"One crew: 3,600 ÷ 90 = 40 days. To reach 20 days you need 40 ÷ 20 = 2 crews, giving 180 m³/day and exactly 20 days. The mention of three possible locations is there to confirm two crews can work without interference — it does not mean you should mobilise three. Mobilising three would finish in 13.3 days and cost 50% more crew time than the client asked for. Match the resource to the requirement, not to the maximum the site allows."}
},

{id:"L4", lvl:1, t:"Logic: the four relationship types",
 sub:"FS, SS, FF, SF, lag versus lead, the SS+FF pair, and why open ends break the calculation",
 body:[
  {p:"Logic is what turns a list of activities into a network. Without it you have a spreadsheet with bars. With it you have a model that calculates — one that will tell you what happens to the finish date if the transformer arrives three weeks late, without you having to work it out by hand."},

  {h:"The four relationships"},
  {p:"Every relationship connects the start or finish of a predecessor to the start or finish of a successor. There are four combinations."},
  {tbl:[["Type","Reads as","Typical use"],[
   ["<b>FS</b> Finish-to-Start","B cannot start until A finishes","The default. Pour foundation → cure → erect steel"],
   ["<b>SS</b> Start-to-Start","B cannot start until A has started","Overlapping continuous work. Trench excavation SS+3 → cable laying"],
   ["<b>FF</b> Finish-to-Finish","B cannot finish until A finishes","Trailing completion. Cable laying FF+2 → backfill"],
   ["<b>SF</b> Start-to-Finish","B cannot finish until A has started","Very rare. Shift handover, or temporary supply removed once permanent is live"]
  ]]},
  {p:"FS should be the overwhelming majority of your relationships — a healthy network runs around 90% FS. The DCMA assessment expects at least 90% FS for exactly this reason: FS is the only relationship whose meaning is unambiguous to everyone who reads the programme."},
  {w:"rel"},

  {h:"Lag and lead"},
  {def:["Lag","A mandatory waiting period imposed on a relationship. FS+7 means the successor cannot start until seven days after the predecessor finishes."]},
  {p:"Lag represents real, physical waiting: concrete curing, a paint system cure, a statutory notice period, transformer oil settling before energisation. It is legitimate when it represents something the world genuinely requires."},
  {p:"A <b>lead</b> is a negative lag — FS−5 means the successor can start five days <i>before</i> the predecessor finishes. Leads are prohibited on virtually every well-run project and flagged by the DCMA assessment, which expects <b>zero</b> of them."},
  {warn:["Why leads are banned","Three reasons, in order of seriousness. First, a lead breaks the backward pass in ways that produce float values which are arithmetically correct and practically meaningless. Second, it hides real logic: FS−5 almost always means 'the last five days of A can overlap with B', which is honestly modelled as SS with a lag, or by splitting A into two activities. Third, under progress override or an out-of-sequence update, leads produce dates that are indefensible in a delay analysis — and that is where it costs money."]},
  {p:"There is also a softer rule about long lags. A 30-day lag on an FS relationship is usually hiding an activity. If the wait is 30 days of transformer oil filtration, that is work with a resource, a cost and a risk — model it as an activity so it can be seen, progressed and, if necessary, accelerated."},

  {h:"The SS + FF pair"},
  {p:"This is the pattern that separates planners who have built overlapping work from those who have not. Consider trenching 2 km of cable route and laying cable in it. The cable crew follows the trenching crew down the route."},
  {fx:"Excavate Trench   ──────────────────────  20 days\n                  SS+3            FF+2\nLay Cable             ──────────────────────  18 days"},
  {p:"<b>SS+3</b> says cable laying cannot start until three days after trenching starts — the crew needs a working front. <b>FF+2</b> says cable laying cannot finish until two days after trenching finishes — you cannot lay the last cable until the last trench exists."},
  {p:"Use SS alone and cable laying is free to finish before the trench does, which is physically impossible. Use FF alone and cable laying is free to start on day one, before there is a trench. <b>The pair constrains both ends and is the correct model for any pursuit relationship.</b>"},
  {ok:["Say it out loud to test it","Read every relationship as a sentence. 'Cable laying cannot start until three days after trenching starts.' If the sentence is true on site, the logic is right. If you cannot make a sentence, the relationship is decoration."]},

  {h:"Open ends"},
  {def:["Open end","An activity with no predecessor (a dangling start) or no successor (a dangling finish), other than the project's own start and finish milestones."]},
  {p:"An activity with no predecessor is free to start on day one, whatever the reality. An activity with no successor cannot delay anything, so it will always show enormous float and will never appear on the critical path — even if it is a contractual deliverable that everybody is waiting for."},
  {p:"The second case is the dangerous one. A dangling finish silently removes an activity from the critical path calculation. It is the classic mechanism behind a programme whose finish date will not move: the slipping work is genuinely late, but the network has no path from it to the completion milestone, so the arithmetic never reaches the date."},
  {p:"The DCMA assessment allows <b>at most 5% missing logic</b>, and in practice a reviewed baseline should have zero open ends apart from the project start and finish milestones. Every activity should answer both questions: what must happen before this, and what is waiting for this to finish?"},
  {tip:["The first three things to run on any programme you are handed","Count the open ends. Count the leads. Count the constraints. Those three numbers tell you more about whether the dates can be trusted than an hour of reading bars, and you can produce them in five minutes."]}
 ],
 check:{type:"mcq",
  q:"A contractor models 'Install Cable Tray' (30d) and 'Pull Cables' (24d) with a single <span class=\"mono\">SS+5</span> relationship. Cable tray install is then delayed and finishes 12 days late. What does the network do, and why is it wrong?",
  opts:[
   "Pull Cables is pushed 12 days — correct behaviour, no problem",
   "Pull Cables is pushed 5 days only, which understates the delay",
   "Pull Cables is unaffected at its finish and can still complete before the tray exists, because nothing constrains its finish",
   "Pull Cables is pushed 12 days but its duration shortens automatically"
  ],
  a:2,
  hint:"An SS relationship constrains only one thing — when the successor may start. Ask yourself what, if anything, is stopping Pull Cables from finishing.",
  why:"SS+5 constrains only the start of Pull Cables to five days after tray installation starts. Once that start condition is met, nothing in the network prevents Pull Cables finishing before Install Cable Tray does — which is physically impossible, since you cannot pull cable into tray that has not been installed. The correct model is the SS+FF pair: SS+5 to give the pulling crew a working front, plus FF+n so the pull cannot complete until the tray is complete. This is one of the most common real defects in submitted programmes, and it systematically understates delay."}
},

{id:"L5", lvl:1, t:"The network, CPM and float",
 sub:"Forward pass, backward pass, total float, free float, multiple critical paths, negative float and who owns it",
 body:[
  {p:"Critical path method is the arithmetic core of the discipline. It is not difficult — it is two passes through a network and one subtraction — but it must be genuinely understood rather than trusted to software, because every schedule argument you will ever have is ultimately an argument about these numbers."},

  {h:"The forward pass — how early can it happen?"},
  {p:"Start at the beginning with early start (ES) = 0 (or day 1, depending on convention; we use day 0 here for clean arithmetic and consistency). Work forwards through the network."},
  {fx:"EF = ES + Duration\nES of a successor = <b>maximum</b> EF of all its predecessors"},
  {p:"The word <b>maximum</b> is the whole point. If an activity has three predecessors finishing on days 8, 11 and 14, it starts on day 14. You wait for the last one. The forward pass gives you the earliest the project can finish."},

  {h:"The backward pass — how late can it happen?"},
  {p:"Start at the end. Set the late finish (LF) of the final activity equal to its early finish — this is what makes the critical path emerge with zero float. Work backwards."},
  {fx:"LS = LF − Duration\nLF of a predecessor = <b>minimum</b> LS of all its successors"},
  {p:"Here the word is <b>minimum</b>. If an activity feeds three successors that must start on days 20, 17 and 23, it must finish by day 17. You are constrained by the most demanding successor."},

  {h:"Total float"},
  {def:["Total float (TF)","The amount of time an activity can be delayed from its early start without delaying the project completion date."]},
  {fx:"TF = LS − ES   =   LF − EF\n\nBoth forms give the same number. If they do not,\nyou have made an arithmetic error."},
  {p:"Total float is <b>shared along a chain</b>. If three activities in series each show 6 days of total float, there are not 18 days available — there are 6 days shared between them. Consume all 6 on the first activity and the other two drop to zero float immediately. This is the single most misunderstood property of float on live projects, and it is the reason a construction manager who \"uses up a bit of float here and there\" can put a chain on the critical path without anyone noticing until the update."},
  {w:"cpm"},

  {h:"Free float"},
  {def:["Free float (FF)","The amount of time an activity can be delayed without delaying the <i>early start of any successor</i>."]},
  {fx:"FF = ( minimum ES of all successors ) − EF of this activity"},
  {p:"Free float is float you own privately. Using it affects nobody. Total float belongs to the chain; free float belongs to the activity. Free float is always less than or equal to total float, and the last activity in a chain of float typically holds all of it as free float."},
  {p:"In practice free float answers the site question: \"can I slip this by two days without anybody phoning me?\" Total float answers the project question: \"can I slip this by two days without missing the date?\" They are different questions and you need both."},

  {h:"Longest path versus total float"},
  {p:"The <b>critical path</b> is properly defined as the <b>longest continuous path through the network</b>, which determines the project duration. In a simple, unconstrained network the longest path is exactly the set of activities with zero total float, and the two definitions agree."},
  {p:"They separate as soon as you introduce constraints, multiple calendars or multiple finish milestones. A constraint can create zero-float activities that are not on the longest path, and a deadline on an intermediate milestone can produce a chain of negative float that is not driving contract completion. This is why Primavera P6 offers 'Longest Path' as a separate critical-path definition from 'Total Float ≤ 0', and why serious reviewers use it."},
  {tip:["What to say when asked in an interview","'The critical path is the longest path through the network. In an unconstrained schedule that equals the zero-total-float chain, but with constraints or multiple calendars I would use longest path, because total float can be distorted by a constraint that has nothing to do with contract completion.' That answer distinguishes you immediately."]},

  {h:"Multiple critical paths"},
  {p:"Nothing prevents two or more chains having the same total length. A substation with civil works, GIS installation and protection engineering running in parallel can easily have two paths of identical duration converging at energisation. Both are critical. Both need managing. Shortening only one of them changes the project duration by nothing at all — you will spend money accelerating and the finish date will not move."},
  {p:"Near-critical paths matter for the same reason. A chain with 3 days of float on a 24-month project is not comfortable; it is one bad week from being critical. Most reviewers examine everything below about 10–15 days of float on a project of that length, and any recovery plan that ignores near-critical chains will simply move the problem."},

  {h:"Negative float"},
  {p:"Negative float means the arithmetic has been told to finish earlier than the logic allows. It arises when a constraint or an imposed deadline sits before the calculated early finish."},
  {fx:"Calculated early finish  =  day 640\nContract deadline imposed =  day 610\n                            ─────────\nTotal float on the driving chain = <b>−30 days</b>"},
  {p:"Negative float is not a defect in itself — it is the schedule reporting, correctly, that you are 30 days behind against a required date. That is useful information. It becomes a defect when it is created by a constraint that should not be there, and it becomes a serious problem when it is left unexplained for months, because a programme sitting at −30 for six updates is a programme nobody is using."},

  {h:"Who owns float?"},
  {p:"This question is commercial, not technical, and the answer depends on the contract."},
  {ul:[
   "<b>The project owns it</b> — the mainstream position under FIDIC and the SCL Delay and Disruption Protocol. Float is a project resource consumed by whichever event arrives first. A contractor delay that consumes float is not compensable, and a client delay that consumes float but does not push the completion date generally earns no extension of time.",
   "<b>The contractor owns it</b> — asserted by contractors, and occasionally supported by bespoke wording. The argument is that float is the product of the contractor's own planning efficiency.",
   "<b>Shared or contractually allocated</b> — some bespoke forms allocate float explicitly, or make float ownership a term. Where the contract says something, the contract wins."
  ]},
  {ok:["The practical consequence","This is why contractors dislike submitting programmes that finish materially earlier than the contract date. Doing so creates visible float that, under the project-owns-float position, the client may consume for free. It is also why a client reviewer checks whether the submitted completion date matches the contract date — the gap is commercially loaded, and both sides know it."]}
 ],
 check:{type:"calc",
  q:"Activity D has ES 12, duration 6, and LF 24. Its only successor has ES 20. <b>What is D's free float?</b>",
  a:2, tol:0.01, unit:"days",
  hint:"Free float does not use LF at all. Find D's early finish first, then compare it with the successor's early start. The LF of 24 is there to let you compute total float — which is a different number.",
  why:"EF = ES + duration = 12 + 6 = 18. FF = (minimum successor ES) − EF = 20 − 18 = 2 days. Note that total float here is LF − EF = 24 − 18 = 6 days, so D has 6 days of total float but only 2 days of free float. Slipping D by 2 days affects nobody. Slipping it by 5 days delays its successor while still not delaying the project — and that distinction is exactly why both numbers are reported."}
},

{id:"L6", lvl:1, t:"Calendars",
 sub:"Work weeks, conversion factors, the ten-hours-including-lunch trap, and why reviewers check calendars first",
 body:[
  {p:"Calendars are the least glamorous topic in planning and the one that most reliably invalidates a programme. Durations are meaningless without the calendar they are measured on. A 20-day activity is four calendar weeks on a five-day calendar, a little over three on a six-day calendar, and under three on a seven-day calendar. Same number, three different dates."},

  {h:"What a calendar actually defines"},
  {ul:[
   "<b>Which days are working days</b> — the work week, plus public holidays and any project-specific shutdowns.",
   "<b>Which hours are working hours</b> — the shift pattern, including whether breaks are working time.",
   "<b>The hours-per-day conversion factor</b> — how the scheduling tool converts between hours, days, weeks and months."
  ]},
  {p:"That third item causes more silent damage than the other two combined, because it is set once in a settings dialog and then forgotten."},

  {h:"The conversion factor"},
  {p:"Primavera P6 stores durations internally in hours and displays them in whatever unit you choose, converting using the values in Admin Preferences. If those settings say 8 hours per day but your project calendar defines a 10-hour working day, every duration you type is silently mistranslated."},
  {fx:"You type:            10 days\nCalendar day:        10 working hours\nActual work content: 100 hours\n\nAdmin conversion set to 8 h/day:\nDisplayed / reported: 100 ÷ 8 = <b>12.5 days</b>\n\nA 25% error on every duration in the programme,\nintroduced by a settings dialog nobody opened."},
  {warn:["The rule","The hours-per-day in Admin Preferences must equal the hours per working day in your project calendars. If your project genuinely runs mixed shift patterns across different calendars, pick the dominant one, set it consistently, and state the choice in the basis of schedule. Do not leave it at the software default and hope."]},
  {w:"cal"},

  {h:"The ten-hours-including-lunch trap"},
  {p:"This is the most common calendar error in Gulf EPC work and it is worth walking through slowly. The site works <b>07:00 to 17:00</b> with a one-hour break. Ask three people how many hours a day that is and you will get two answers."},
  {fx:"Gross span   07:00 → 17:00        = 10 hours\nBreak        12:00 → 13:00        =  1 hour\n                                    ────────\nNet working hours per day          = <b>9 hours</b>"},
  {p:"If the calendar is built with a 10-hour working day but the crews actually produce for 9, every duration in the programme is optimistic by 11%. On a 600-day programme that is roughly 66 working days of embedded, invisible optimism — three months of contract programme that was never there."},
  {p:"The error is subtle because the calendar <i>looks</i> right. Someone typed 07:00 and 17:00 into the calendar dialog, which is where the ten came from, and the break was never deducted. The fix is to define the working time as two blocks — 07:00–12:00 and 13:00–17:00 — rather than one continuous span."},
  {tip:["How to check any calendar in ten seconds","Open the calendar, add up the working-time blocks for a single standard day, and compare that number with the hours-per-day setting. If they differ, stop and find out why before you look at anything else in the programme. It is a ten-second check that finds a percentage-level error."]},

  {h:"Multiple calendars on one project"},
  {p:"A real substation project needs several calendars, because different work genuinely runs on different patterns."},
  {tbl:[["Calendar","Applied to","Typical pattern"],[
   ["Site 6-day","Civil, erection, installation","Sat–Thu, 9 net hours, Fri off, public holidays off"],
   ["Engineering 5-day","Design, drawings, approvals","Mon–Fri, 8 hours, office holidays"],
   ["Continuous 7-day","Curing, oil filtration, HV withstand, transit","24 h/day, no holidays"],
   ["Procurement 5-day","POs, expediting, vendor documents","Mon–Fri, 8 hours"],
   ["Commissioning","Energisation windows, outage windows","Often 7-day with defined outage slots"]
  ]]},
  {p:"The continuous calendar is the one people forget, and it produces the error that most annoys reviewers: <b>concrete curing on a working calendar</b>. Concrete does not know it is Friday. A 7-day cure period placed on a 6-day site calendar becomes 8 calendar days in reality but is modelled as 7 working days, and across a foundation-heavy substation project with dozens of pours the accumulated error is measured in weeks. Curing, transit, oil settling, paint cure and statutory notice periods all belong on a 7-day continuous calendar."},
  {ok:["Assign the calendar to the work, not to the contractor","The question is not 'whose activity is this?' but 'what governs the passage of time here?' If the answer is a crew, use a working calendar. If the answer is chemistry, physics or the postal service, use a continuous calendar."]},

  {h:"Why reviewers open the calendars first"},
  {p:"A client-side reviewer receiving a baseline for the first time will typically check calendars before logic, before float and before the S-curve. There are three reasons."},
  {ol:[
   "<b>It is cheap.</b> Five minutes of checking tests every date in the programme at once, because every date is derived from a calendar.",
   "<b>Errors here are systematic.</b> A logic error affects one chain. A calendar error affects everything on that calendar, in the same direction, invisibly.",
   "<b>It reveals intent.</b> Whether curing sits on a continuous calendar, whether holidays are loaded, whether the break is deducted — these tell a reviewer within minutes whether the programme was built by someone who understands the work or assembled to satisfy a submission requirement."
  ]},
  {say:["A PMC lead planner, transmission projects","I have rejected baselines without opening the Gantt chart. If the public holidays are not loaded and curing is on the six-day calendar, I already know what the rest looks like."]},
  {p:"One last habit: load the public holiday calendar for the full contract duration at the outset, including estimated Islamic holidays where those apply, and state in the basis of schedule that they are estimates subject to official announcement. It removes an entire category of argument later."}
 ],
 check:{type:"calc",
  q:"A site works <b>06:30 to 17:30</b> with a 45-minute lunch break and two 15-minute tea breaks, all of which are non-working time. <b>How many net working hours are in one day?</b> Give the answer in hours to one decimal place.",
  a:9.75, tol:0.02, unit:"hours",
  hint:"Work out the gross span in hours first, then subtract every block of non-working time. There are three breaks, not one.",
  why:"Gross span 06:30 to 17:30 = 11.0 hours. Deduct 45 minutes (0.75 h) for lunch and two 15-minute tea breaks (0.5 h total) = 1.25 hours of non-working time. Net = 11.0 − 1.25 = 9.75 hours. A calendar built at 11 hours per day would embed a 12.8% optimism into every duration in the programme. This is precisely the check a reviewer runs first, and it is the reason working time should be entered as discrete blocks rather than one continuous span."}
},

/* ========================================================================== *
 *  LEVEL 2 — BUILDING THE SCHEDULE
 * ========================================================================== */

{id:"L7", lvl:2, t:"Schedule levels and the baseline",
 sub:"Levels 1 to 5, the roll-up rule, what a baseline is, when it may change, and what a submission contains",
 body:[
  {p:"A programme is not one document. It is one dataset presented at several resolutions, each aimed at a different reader. Confusing the levels is why a board sees a 400-line Gantt chart and a foreman sees a bar labelled \"Civil Works\" — both useless, for opposite reasons."},

  {h:"The five levels"},
  {ig:"levels"},
  {tbl:[["Level","Name","Typical lines","Audience","Updated"],[
   ["<b>1</b>","Project Master / Executive","10–25","Board, client executive","Monthly"],
   ["<b>2</b>","Summary / Management","50–150","Project director, client PM","Monthly"],
   ["<b>3</b>","Control / Baseline","800–5,000","Project team — <b>this is the working programme</b>","Weekly / monthly"],
   ["<b>4</b>","Detail / Execution","Varies","Construction managers, superintendents","Weekly"],
   ["<b>5</b>","Short-interval / Look-ahead","Varies","Foremen, crews","Daily / weekly"]
  ]]},
  {p:"<b>Level 3 is the contractual programme.</b> It is the one that gets baselined, the one progress is measured against, and the one a delay analysis will be run on. Levels 1 and 2 are roll-ups of it. Levels 4 and 5 are decompositions of it. If you only ever build one properly, build Level 3."},

  {h:"The roll-up rule"},
  {ok:["One dataset, many views","Every level must roll up from, or drill down into, the same underlying data. Level 1 must be a filtered summary of Level 3 — not a separate file someone maintains by hand in PowerPoint."]},
  {p:"When Level 1 is maintained separately, it drifts. Within four months the executive programme shows a completion date the working programme has not supported since month two, and nobody notices until a board meeting. Achieve the roll-up through WBS summarisation and activity coding, not through parallel files."},
  {p:"Level 4 and 5 are the reverse case: they are usually maintained outside the scheduling tool, in Excel or a short-interval planning system. That is acceptable and normal — but the look-ahead must be <i>generated from</i> the Level 3 programme, and its actual outturn must be fed back into it. A look-ahead that is written independently of the programme becomes an alternative reality, and site will believe the look-ahead."},

  {h:"What a baseline actually is"},
  {def:["Baseline","The approved version of the schedule, frozen at a point in time, against which all subsequent performance is measured. It is a reference, not a plan you keep editing."]},
  {p:"The baseline serves one purpose: to give you a fixed thing to compare against. The instant you edit it to match reality, you have destroyed its only function. This sounds obvious and it is violated constantly, usually with the phrase \"the baseline was out of date so we refreshed it\"."},
  {ig:"baseline"},
  {p:"A baseline has three components that must be frozen together, and freezing only the first is a common half-measure:"},
  {ul:[
   "<b>Schedule baseline</b> — the dates, durations and logic",
   "<b>Cost baseline</b> — the time-phased budget, which is the PV curve used in earned value",
   "<b>Scope baseline</b> — the WBS, WBS dictionary and scope statement the other two were built from"
  ]},

  {h:"When a baseline may change"},
  {p:"Rarely, and only for defined reasons. The legitimate triggers are:"},
  {ol:[
   "<b>An approved variation or change order</b> that adds or removes scope",
   "<b>An approved extension of time</b> that moves the contract completion date",
   "<b>A major descoping</b> or contractual restructuring",
   "<b>A demonstrable error</b> in the original baseline, agreed by both parties in writing"
  ]},
  {warn:["What is not a reason to rebaseline","Being behind schedule. This is the entire point. A contractor who is 60 days late and rebaselines to a new completion date has not solved anything — they have deleted the evidence of the delay, and with it their own extension-of-time claim. Under most contracts the correct response to being late is a <b>recovery schedule</b> against the existing baseline, not a new baseline. Rebaselining to hide delay is the single most damaging thing a planner can do to their own employer's commercial position."]},
  {p:"When a baseline does legitimately change, keep every prior version. The sequence of baselines is itself evidence, and a forensic analyst reconstructing events three years later will want Baseline 0, Baseline 1 and the approvals that separated them."},

  {h:"What a baseline submission contains"},
  {p:"Submitting only the schedule file is the mark of an inexperienced planning team, and it is the most common cause of a first-round rejection. A complete submission has eight parts."},
  {tbl:[["#","Component","Why the reviewer wants it"],[
   ["1","Narrative / basis of schedule","States assumptions, methods, exclusions, calendars and constraint justifications"],
   ["2","Level 3 programme (native + PDF)","The working file, and a readable version"],
   ["3","Level 1 and Level 2 summaries","For management review"],
   ["4","Critical path report","Longest path listing, with float values"],
   ["5","Resource histograms and S-curves","Demonstrates the programme is physically resourceable"],
   ["6","WBS and coding structure","Shows how the programme rolls up and reports"],
   ["7","Schedule quality report (DCMA 14-point)","Pre-empts the reviewer's own checks"],
   ["8","Assumptions and constraints register","Every constraint listed with a written justification"]
  ]]},
  {tip:["Run the reviewer's checks before they do","Submit your own DCMA 14-point report with the baseline, with written justifications for every test you fail. A reviewer who finds nine failures unannounced rejects the programme. A reviewer handed the same nine failures with credible explanations — 'the 120-day activity is transformer manufacture per PO 4500-118' — usually accepts it. You have not changed the schedule; you have changed whether the reviewer has to guess at your intent."]},
  {say:["A client project controls manager","The narrative tells me whether to trust the file. If there is no narrative, I assume the dates are the output of a tool rather than the output of a plan, and I review accordingly."]}
 ],
 check:{type:"mcq",
  q:"At month 9 of a 24-month contract, a contractor is 45 days behind. Their planning manager proposes issuing a revised baseline with a new completion date reflecting current forecast. What is the strongest objection?",
  opts:[
   "The revised baseline would fail the DCMA 14-point assessment",
   "It removes the measurement reference, and with it the contractor's own evidence for any extension-of-time entitlement",
   "The client is unlikely to approve it within the reporting period",
   "Level 1 and Level 2 summaries would need to be reissued"
  ],
  a:1,
  hint:"Ask who is harmed by deleting the record of the delay. It is not only the client.",
  why:"Rebaselining to absorb delay destroys the comparison that proves delay occurred — which is the contractor's own evidence base for entitlement. If part of that 45 days was caused by late client access or late free-issue equipment, the new baseline silently converts a compensable client delay into the contractor's own accepted plan. The correct instrument is a recovery schedule measured against the retained baseline, plus a delay register. Options (a), (c) and (d) are real inconveniences but none of them are the commercial injury."}
},

{id:"L8", lvl:2, t:"Resource and cost loading",
 sub:"Resource types, the two-resource structure, driving versus non-driving, milestone cost loading, histograms and levelling",
 body:[
  {p:"An unloaded schedule tells you when work is planned. A loaded schedule tells you whether it is possible. The difference shows up the first time you produce a manpower histogram and discover the programme requires 480 electricians in March on a site that can accommodate 200."},

  {h:"The three resource types"},
  {tbl:[["Type","Measured in","Examples","Behaviour"],[
   ["<b>Labour</b>","Hours","Foremen, electricians, welders, engineers","Time-phased across duration; drives cost by rate"],
   ["<b>Nonlabour</b>","Hours","Cranes, piling rigs, compressors, test equipment","Same as labour but tracked separately for plant cost"],
   ["<b>Material</b>","Any unit — m, m³, no., lump sum","Cable, concrete, GIS bays, transformers","Quantity-based; the vehicle for cost loading"]
  ]]},
  {p:"The distinction matters because labour and nonlabour hours drive the histograms and the levelling analysis, while material units carry the money without inflating your manpower curve. Load a AED 40 million transformer as a labour resource and your histogram becomes nonsense."},

  {h:"The two-resource structure"},
  {p:"This is the practical arrangement used on most large EPC projects and it is worth understanding as a pattern, because it solves a real conflict: <b>progress weighting and cost are not the same thing</b>, and trying to make one resource do both jobs produces a programme that reports one of them wrongly."},
  {ig:"tworesource"},
  {ul:[
   "<b>Resource 1 — Weightage.</b> Set up as a <i>Labour</i> resource, unit price 1.00. Units assigned to each activity represent its share of progress. Because the price is 1.00, budgeted cost equals budgeted units, so P6's Performance % Complete becomes a direct read-out of weighted physical progress.",
   "<b>Resource 2 — Cost.</b> Set up as a <i>Material</i> resource carrying the actual money — contract value, payment milestones, cash flow. Kept separate so that commercial revisions never disturb the progress measurement basis."
  ]},
  {ok:["Why separate them","Progress weighting and cash value diverge constantly. Mobilisation may be 8% of your cash flow and 1% of your physical work. A payment milestone may fall on a date with no physical work at all. Separating the two resources lets the progress curve describe the work and the cost curve describe the money, without either corrupting the other."]},
  {p:"You will meet the alternative on smaller projects: a single cost resource used for both. It works, it is simpler, and it fails the moment the client asks why the project is 34% complete on progress and 41% complete on value — a question that has a perfectly good answer which the single-resource structure cannot produce."},

  {h:"Driving versus non-driving resources"},
  {def:["Driving resource","A resource whose availability and quantity determine the activity's duration. Change the assignment and the duration recalculates."]},
  {p:"With a driving resource, duration is a function of units and units-per-time. Assign 800 hours at 8 hours/day per person with 5 people and you get 20 days; add two people and the duration drops automatically. This is honest but volatile — a bulk edit to resource assignments can silently move your completion date."},
  {p:"A non-driving resource is carried along by a duration you have fixed independently. Most EPC projects run non-driving assignments on the majority of activities and reserve driving assignments for genuinely resource-limited work, because a programme whose dates move when someone edits a crew size is difficult to control contractually."},
  {tip:["Set the duration type deliberately","In P6 the interaction of Duration Type (Fixed Duration &amp; Units, Fixed Units/Time, and so on) with driving resources is the mechanism behind most 'my dates changed and I don't know why' incidents. Pick <b>Fixed Duration &amp; Units</b> as the project default unless you have a specific reason not to, and state the choice in the basis of schedule."]},

  {h:"Cost loading against payment milestones"},
  {p:"Cost loading is not simply spreading contract value across activities pro-rata. On EPC contracts the money arrives against defined payment milestones, and the cost curve must reflect that or your cash flow forecast is fiction."},
  {p:"A typical supply-and-install package for GIS equipment might be split:"},
  {tbl:[["Milestone","% of item value","When earned"],[
   ["Approved drawings / design release","10%","On engineering approval"],
   ["Materials at manufacturer's works","15%","On inspection release"],
   ["Delivery to site (CIF / ex-works split)","45%","On receipt and site inspection"],
   ["Erection and installation complete","20%","On mechanical completion"],
   ["Testing, commissioning and PAC","10%","On provisional acceptance"]
  ]]},
  {p:"Load those percentages onto the activities that actually achieve them. The result is a cost curve that steps in a way a smooth pro-rata spread never would, and that step pattern is exactly what the finance team needs. Add advance-payment recovery and retention on top and you have a genuine cash flow rather than a shape."},
  {warn:["The classic cost-loading error","Loading 45% of an equipment item's value onto a 2-day 'Delivery to Site' activity is correct commercially and produces a vertical cliff in the S-curve. That is fine — but it means your <i>progress</i> curve must not use the same resource, or the project will appear to leap 6% in physical completion because a lorry arrived. This is precisely the problem the two-resource structure solves."]},

  {h:"Histograms and levelling"},
  {p:"A resource histogram plots demand over time against an availability limit. It answers the only question that matters about resource feasibility: does the plan ever ask for more than exists?"},
  {w:"hist"},
  {p:"Where demand exceeds the limit you have three options, in increasing order of pain:"},
  {ol:[
   "<b>Resource smoothing</b> — move activities within their available float only. The completion date does not change. Always try this first.",
   "<b>Resource levelling</b> — allow the completion date to move so that the limit is respected. Honest, and often unacceptable commercially.",
   "<b>Raise the limit</b> — mobilise more people, add a shift, or subcontract. Costs money, and is constrained by site capacity, accommodation and permits."
  ]},
  {p:"Levelling in the software is a starting point, not an answer. Automatic levelling will happily delay a critical activity to satisfy a limit, and it makes decisions using priority rules that have nothing to do with your commercial position. Run it, look at what it did, then make the decisions yourself and implement them as logic or constraints you can explain."},
  {say:["A construction manager, 400MW plant","The histogram is the only planning output I read cover to cover. If it says I need 900 men in month 14, I need to know in month 3, because that is when I book the accommodation."]}
 ],
 check:{type:"mcq",
  q:"A contractor loads GIS equipment value as a single <b>Labour</b> resource so that it appears in the manpower histogram \"for completeness\". What is the most serious consequence?",
  opts:[
   "The cost S-curve will be understated because labour rates differ from material values",
   "The manpower histogram becomes unusable for resource planning, since millions of dirhams of equipment value appear as labour hours",
   "P6 will refuse to level the schedule",
   "Performance percent complete will stop calculating"
  ],
  a:1,
  hint:"Ask what the histogram is used for and who reads it. What happens to that decision when equipment value is expressed in the same units as people?",
  why:"Labour resources are measured in hours and feed the manpower histogram and levelling analysis. Loading equipment value there injects an enormous phantom labour demand, making the histogram meaningless for the one decision it exists to support — how many people are needed, when. Equipment value belongs on a Material resource, which carries cost without distorting manpower. Option (a) is backwards, (c) is untrue, and (d) is untrue — performance percent complete would still calculate, it would simply be calculating against a corrupted basis."}
},

{id:"L9", lvl:2, t:"Weightage and progress measurement",
 sub:"Weightage is earned value, bases for weighting, rules of credit, the engineering and procurement curves",
 body:[
  {p:"Ask ten planners what progress means and you will get ten answers. Ask them to prove it and you will get three. Progress measurement is where planning stops being a drawing exercise and becomes a measurement discipline, and the concept that carries the whole thing is weightage."},

  {h:"Weightage is earned value"},
  {p:"This is the sentence that makes the rest of the game easier. <b>Weightage and earned value are the same idea expressed in different units.</b> Weightage expresses each activity's share of the total as a percentage; earned value expresses it in currency. Multiply weightage by the budget at completion and you have earned value. Divide earned value by BAC and you have weighted percent complete."},
  {fx:"Activity weightage %  =  Activity budget ÷ Total budget × 100\n\nProject % complete   =  Σ ( activity weightage × activity % complete )\n\nEarned value (EV)    =  Project % complete × BAC"},
  {p:"Everything in Level 3 of this course is a consequence of that identity. If you understand weightage properly now, earned value will be arithmetic rather than a new subject."},
  {ig:"weightage"},

  {h:"What to weight by"},
  {p:"The weighting basis must be agreed with the client before the first progress report, because changing it later changes history."},
  {tbl:[["Basis","Strength","Weakness","Best used for"],[
   ["<b>Cost / value</b>","Aligns progress with money; auditable","Distorted by equipment-heavy scope","Overall project roll-up"],
   ["<b>Man-hours</b>","Reflects effort and site reality","Ignores material value entirely","Construction and installation"],
   ["<b>Quantity</b>","Directly verifiable on site","Only works within one work type","Cable pulling, concrete, welding"],
   ["<b>Duration</b>","Trivial to compute","Measures time passing, not work done","Level of effort only"]
  ]]},
  {warn:["The equipment-heavy distortion","On a substation, GIS and transformers may be 55% of contract value but under 15% of the man-hours. Weight by cost and the project appears half complete when the equipment is delivered and nothing is installed. Weight by man-hours and the project appears barely started while the majority of the money has been spent. The professional answer is to weight by cost at project level for commercial reporting, and by man-hours within construction packages for site control — and to say clearly which one any given number is."]},

  {h:"Rules of credit"},
  {def:["Rule of credit","A pre-agreed table allocating percentages to defined, verifiable milestones within an activity, so that partial progress is measured rather than estimated."]},
  {p:"Rules of credit exist to remove opinion. Without them, \"the foundation is 60% complete\" is a negotiation. With them, it is a lookup."},
  {tbl:[["Step — concrete foundation","Credit","Cumulative"],[
   ["Excavation complete","15%","15%"],
   ["Blinding and formwork","20%","35%"],
   ["Reinforcement fixed and inspected","25%","60%"],
   ["Concrete poured","30%","90%"],
   ["Formwork stripped, cured, surveyed","10%","100%"]
  ]]},
  {ok:["The test of a good rule of credit","Every step must be <b>binary and inspectable</b>. 'Reinforcement fixed and inspected' is either signed off or it is not. 'Reinforcement mostly done' is not a step, it is an opinion wearing a percentage."]},

  {h:"The engineering 5-step curve"},
  {p:"Engineering deliverables progress through a document cycle, and the credit reflects where the risk sits — heavily at the front, because producing the drawing is the work and approval is largely waiting."},
  {tbl:[["Step","Credit","Cumulative"],[
   ["Drawing started / design development","20%","20%"],
   ["Internal check and squad review complete","30%","50%"],
   ["Issued for client review (IFR)","20%","70%"],
   ["Client comments incorporated, re-issued","20%","90%"],
   ["Approved / Issued for Construction (IFC)","10%","100%"]
  ]]},
  {p:"Note the deliberate design: a drawing sitting with the client for review is capped at 70%. The contractor cannot earn the last 30% by waiting. That is the correct commercial signal — but it is also why late client review shows up immediately in the engineering curve, which is exactly the evidence you want if review times become an entitlement issue."},

  {h:"The procurement 8-step curve"},
  {p:"Procurement runs the longest cycle on an EPC project and needs the most granular credit, because a 14-month equipment cycle with only two milestones is invisible for a year."},
  {tbl:[["Step","Credit","Cumulative"],[
   ["Requisition / technical specification issued","5%","5%"],
   ["Enquiry issued to bidders","10%","15%"],
   ["Technical bid evaluation complete","10%","25%"],
   ["Purchase order placed","15%","40%"],
   ["Vendor drawings approved","10%","50%"],
   ["Manufacturing complete / FAT passed","25%","75%"],
   ["Shipped / in transit","10%","85%"],
   ["Delivered to site and inspected","15%","100%"]
  ]]},
  {p:"The 25% at manufacturing and FAT is the heart of it — that is where most of the elapsed time and nearly all of the risk lives. A procurement curve that jumps from 40% at PO to 100% at delivery tells you nothing for eleven months and then everything at once."},

  {h:"Physical versus duration percent complete"},
  {p:"This distinction decides whether your programme can report bad news."},
  {ul:[
   "<b>Duration % complete</b> is computed by the software from elapsed time against the data date. It measures the calendar, not the work. It requires no input and therefore no honesty.",
   "<b>Physical % complete</b> is entered by a human against a rule of credit. It measures the work."
  ]},
  {warn:["Two hard facts about P6 you will be asked in interviews","First: on <b>Physical</b> percent complete type, P6 does <b>not</b> auto-calculate actual units — you must enter progress yourself, which is the entire point. Second: entering physical percent complete does <b>not</b> move the forecast finish date. Only remaining duration does that. Many planners assume typing 60% pulls the dates along; it does not, and a programme where physical progress is updated but remaining durations are never re-judged will report accurate progress and fictional dates."]},
  {p:"Use Duration % only for level-of-effort activities where time genuinely is the work. Use Physical % for everything discrete. And when a client rejects a baseline for \"progress measurement basis\", nine times out of ten this is what they found."}
 ],
 check:{type:"calc",
  q:"A package has three activities. A: budget AED 400,000, 100% complete. B: budget AED 1,000,000, 45% complete. C: budget AED 600,000, 10% complete. <b>What is the weighted percent complete of the package?</b> Give your answer as a percentage to one decimal place.",
  a:45.5, tol:0.15, unit:"%",
  hint:"Compute the earned value of each activity in dirhams first, total them, then divide by the total budget. Do not average the three percentages.",
  why:"Earned: A = 400,000 × 1.00 = 400,000. B = 1,000,000 × 0.45 = 450,000. C = 600,000 × 0.10 = 60,000. Total earned = 910,000. Total budget = 2,000,000. Weighted % = 910,000 ÷ 2,000,000 = 45.5%. The straight average of 100%, 45% and 10% is 51.7% — nearly 6 points optimistic, because it gives the small AED 400k activity the same influence as the AED 1m one. Averaging percentages instead of weighting them is one of the most common errors in monthly reporting."}
},

{id:"L10", lvl:2, t:"Updating",
 sub:"The data date, the update cycle, reading the schedule log, retained logic versus progress override",
 body:[
  {p:"Updating is the routine that keeps a programme alive, and it is where most planners spend most of their working lives. Done well it takes two days a month and produces decisions. Done badly it takes two weeks and produces a document."},

  {h:"The data date"},
  {def:["Data date","The point in time separating what has happened from what is forecast. Everything to the left is actual; everything to the right is plan."]},
  {p:"The data date is the most important field in an update and the one most often set wrong. Three rules follow from its definition, and each has a real-world failure attached."},
  {ul:[
   "<b>No remaining work to the left of the data date.</b> If an activity has remaining duration sitting in the past, the schedule is claiming work will be done in a time that has already elapsed. Every reviewer checks this.",
   "<b>No actual dates to the right of the data date.</b> An actual start in the future is a data-entry error, and it is common when someone types the planned date into the actual field.",
   "<b>The data date must match the progress data.</b> Progress collected on the 25th and a data date of the 30th means five days of unrecorded work — the programme will show a slip that did not happen."
  ]},
  {ig:"datadate"},

  {h:"The update cycle"},
  {p:"A disciplined monthly cycle has eight steps in a fixed order. The order matters — analysing before the data is complete wastes the analysis."},
  {ol:[
   "<b>Freeze and collect.</b> Set the cut-off, issue progress sheets, collect actual starts, actual finishes and physical percent complete against the rules of credit.",
   "<b>Copy the schedule.</b> Never update the live file in place. Copy, rename with the data date, keep every version.",
   "<b>Enter actuals.</b> Actual dates first, then progress quantities, then physical percent complete.",
   "<b>Re-judge remaining durations.</b> The step that is skipped most often and matters most — see below.",
   "<b>Set the data date and reschedule.</b> Run the calculation.",
   "<b>Read the schedule log.</b> Before looking at any date, read the log.",
   "<b>Analyse.</b> Critical path movement, float erosion, variance against baseline, near-critical chains.",
   "<b>Report and record.</b> Narrative, look-ahead, and the delay register entry for anything that went wrong and why."
  ]},

  {h:"Remaining duration is a judgement, not a subtraction"},
  {p:"The software will happily compute remaining duration as original duration minus elapsed time. That is arithmetic, not planning, and it is wrong whenever performance has changed — which is always."},
  {fx:"Activity: Install 33kV cable, original duration 40 days\nAt data date: 20 days elapsed, 30% physically complete\n\nSoftware default (linear):  remaining = 40 − 20 = 20 days\n\nPlanner's judgement:\n  30% took 20 days  →  rate = 1.5% per day\n  70% remaining     →  70 ÷ 1.5 = <b>~47 days remaining</b>\n\nThe activity is not 20 days from finishing. It is 47.\nThe difference is a 27-day surprise, and it is available today."},
  {ok:["This is the highest-value thirty minutes in the monthly cycle","Re-judging remaining durations on the twenty or thirty activities that matter is what converts an update from a record into a forecast. A programme where remaining durations are never questioned will report the delay only when the activity fails to finish — by which time nothing can be done."]},

  {h:"Reading the schedule log"},
  {p:"After every reschedule the tool writes a log. Most planners never open it. It contains, free of charge, the list of everything wrong with the programme."},
  {tbl:[["Log entry","What it means","Action"],[
   ["Activities without predecessors","Open ends — free to start any time","Add logic, or justify as a genuine project start"],
   ["Activities without successors","Dangling finishes — cannot delay anything","Add logic. This is the one that hides delay"],
   ["Out-of-sequence activities","Work started before its predecessor finished","Investigate: the logic or the site is wrong"],
   ["Activities with constraints","Every constraint in the file","Check each is justified in the register"],
   ["Activities with actual dates beyond the data date","Data-entry error","Fix before analysing anything"],
   ["Milestones without predecessors/successors","Floating milestones","Connect them"]
  ]]},
  {tip:["Log first, dates second","Reading the log before the dates takes three minutes and prevents you from analysing a critical path that only exists because of an open end. It is the closest thing planning has to a free lunch."]},

  {h:"Retained logic versus progress override"},
  {p:"When work starts out of sequence — the successor begins before its predecessor has finished, which happens constantly on site — the tool must decide how to handle the remaining portions. There are two settings and they give materially different answers."},
  {ig:"retained"},
  {p:"<b>Retained Logic</b> keeps the original relationship. The remaining part of the successor cannot proceed until the predecessor finishes, so the remaining duration is pushed out. This preserves the logic you designed and generally produces a later, more conservative finish date."},
  {p:"<b>Progress Override</b> ignores the relationship for the activity that has already started. The successor proceeds unhindered by the unfinished predecessor. This reflects what is physically happening on site and generally produces an earlier finish date."},
  {tbl:[["","Retained Logic","Progress Override"],[
   ["Treats the network as","Still valid","Overtaken by events"],
   ["Typical effect on finish date","Later","Earlier"],
   ["Best for","Baseline integrity, delay analysis, formal reporting","Reflecting messy site reality in a short-term forecast"],
   ["Risk","Can show a delay that site says is not real","Can hide a genuine logic breach and flatter the forecast"]
  ]]},
  {warn:["Pick one, declare it, and do not switch","Retained Logic is the mainstream default for contractual programmes and the safer choice for any schedule that may be used in a delay analysis — because it does not quietly discard the logic your entitlement argument depends on. Whichever you choose, state it in the basis of schedule and never change it mid-project: switching settings between updates changes the finish date for reasons that have nothing to do with performance, and it will be found."]}
 ],
 check:{type:"calc",
  q:"An activity has an original duration of 60 days. At the data date, 24 days have elapsed and it is <b>20% physically complete</b>. Assuming the achieved production rate continues unchanged, <b>what remaining duration should the planner enter?</b> Give your answer in days, to the nearest whole day.",
  a:96, tol:1, unit:"days",
  hint:"Find the rate actually being achieved per day from the work done so far, then apply that rate to the work that remains. Ignore the original duration entirely — it has been disproved by the evidence.",
  why:"20% was achieved in 24 days, so the achieved rate is 0.8333% per day. The remaining 80% at that rate needs 80 ÷ 0.8333 = 96 days. The software's linear default would have said 60 − 24 = 36 days remaining, understating the position by 60 days. The activity's realistic total duration is now 24 + 96 = 120 days against an original 60 — it is running at half the planned rate, and the update is where that becomes visible. This single calculation, applied to the driving activities, is the difference between a forecast and a hope."}
},

{id:"L11", lvl:2, t:"Reporting",
 sub:"S-curve anatomy, where the peak sits, front and back loading, the two gaps, look-aheads and the delay register",
 body:[
  {p:"Reporting is where planning meets everybody else. The analysis can be flawless and still fail if the report does not let a decision-maker see, in about ninety seconds, what is wrong and what it will cost."},

  {h:"S-curve anatomy"},
  {p:"The S-curve is cumulative progress or cost plotted against time. It is S-shaped for a physical reason, not a cosmetic one: projects start slowly while mobilisation and engineering run, accelerate as construction fronts open in parallel, and slow again as work converges on testing, punch-listing and handover."},
  {ig:"scurve"},
  {ul:[
   "<b>The toe</b> — slow start. Engineering, mobilisation, early procurement. Typically the first 15–20% of duration for well under 10% of value.",
   "<b>The rise</b> — steep middle. Multiple construction fronts open simultaneously. This is where most of the value is earned.",
   "<b>The shoulder</b> — flattening. Fronts close, work becomes sequential and test-driven, and productivity per calendar day falls."
  ]},
  {warn:["Where the peak is — and where it is not","The peak of the <i>periodic</i> curve (the monthly bars beneath the cumulative S) sits in the <b>middle of the project, during peak construction</b> — commonly somewhere around 50–65% of elapsed duration. It is never at handover. If your histogram peaks in the final months, the programme is telling you that the majority of the work is planned for the period when access is most congested, when testing is competing for the same fronts, and when there is no recovery time left. That is not a curve, it is a warning."]},

  {h:"Front-loaded and back-loaded curves"},
  {p:"Compare a submitted curve with a normal S and the deviation is diagnostic."},
  {tbl:[["Shape","Looks like","What it usually means"],[
   ["<b>Normal</b>","Symmetric S, peak mid-project","Credible, resourceable plan"],
   ["<b>Front-loaded</b>","Rises steeply early, flattens late","Value pulled into early activities. Sometimes legitimate (large early equipment payments); often a cash-flow play, and it makes early progress look strong while leaving a mountain of work at the end"],
   ["<b>Back-loaded</b>","Flat early, steep late","Optimistic recovery assumed at the end, or work deferred. The most common shape in a programme that is already in trouble"],
   ["<b>Linear</b>","Straight line","Nobody thought about it. Value spread pro-rata across duration"]
  ]]},
  {p:"A perfectly straight cumulative line is not a neutral choice — it is the signature of a schedule that was cost-loaded by dividing the total by the number of months. It cannot be resourced, because it implies constant manpower from day one to handover."},
  {w:"scurve"},

  {h:"The two gaps"},
  {p:"On a plotted planned-versus-actual curve there are two different measurements, and confusing them is a genuine analytical error rather than a presentational one."},
  {ig:"twogaps"},
  {ul:[
   "<b>The vertical gap</b> — at today's date, planned progress minus actual progress. Measured in percent or currency. This is schedule variance, and it is what conventional earned value reports.",
   "<b>The horizontal gap</b> — how long ago the plan reached the progress you have achieved today. Measured in <b>time</b>. This is the basis of Earned Schedule."
  ]},
  {p:"The vertical gap tells you \"we are 7% behind\". The horizontal gap tells you \"we are eleven weeks behind\". Only one of those is a sentence a project director can act on, and it is not the first one. We build the arithmetic for the horizontal gap properly in Level 3."},

  {h:"Look-aheads"},
  {p:"The look-ahead is the most-read planning output on any site, and it must be <b>generated from</b> the programme rather than written alongside it."},
  {tbl:[["Horizon","Audience","Purpose"],[
   ["2-week","Foremen, crews","Executable work. Crews, permits, materials confirmed"],
   ["4-week","Construction managers","Coordination, resource booking, interface clearing"],
   ["8 or 12-week","Project manager, client","Constraint removal — approvals, access, free-issue equipment"]
  ]]},
  {ok:["The look-ahead is a constraint-removal tool","Its real value is not the bars. It is the list of things that must be resolved before the work in that window can start: a permit not yet applied for, a drawing not yet approved, an access area not yet handed over. A look-ahead without a constraints list is a picture. With one, it is a management instrument."]},

  {h:"WPR and MPR"},
  {p:"The weekly progress report is short and operational: progress against the look-ahead, constraints, manpower on site, safety, and what changed. Two pages, distributed the same week."},
  {p:"The monthly progress report is the contractual document. It typically carries the narrative, updated programme and critical path, S-curves for progress and cost, manpower histogram, earned value indices, procurement and engineering status, risks, and the delay register. It is the document that will be read in a dispute, which changes how you write it."},
  {say:["A commercial manager, EPC contractor","Every monthly report is a witness statement written before anyone knows there will be a case. Write it as though it will be read out."]},

  {h:"The delay register habit"},
  {p:"Keep a running register from day one. Each row: event date, description, cause, responsible party, activities affected, days of impact, notice reference and current status. Add rows as events happen, not when a claim is contemplated."},
  {p:"Three reasons this habit matters more than any other in reporting. Contemporaneous records carry far greater evidential weight than reconstructions. Contractual notice periods — commonly 28 days under FIDIC — are missed by teams who intended to write it up later. And a register kept from the start records events whose significance was not apparent at the time, which is precisely the evidence a reconstruction cannot produce."},
  {tip:["Cheap insurance","A delay register costs about ten minutes a week. On a project of any size it is the highest return-on-effort activity in the planning function, and it is the first thing a forensic analyst asks for."]}
 ],
 check:{type:"mcq",
  q:"A contractor's baseline S-curve for a 30-month substation shows 22% of value earned in the first 4 months, then a long flat middle, then 30% in the final 3 months. The manpower histogram peaks in month 28. What is the most defensible reviewer response?",
  opts:[
   "Accept — front-loading is normal on EPC because of early equipment payments",
   "Reject — the curve is both front-loaded on value and back-loaded on work, and a manpower peak in month 28 is not resourceable alongside testing and handover",
   "Accept, but require the contractor to resubmit the histogram only",
   "Reject solely because a linear curve would be more realistic"
  ],
  a:1,
  hint:"There are two separate problems here. Look at where the value sits, then look separately at where the physical work sits. Then ask what else is happening in month 28.",
  why:"Two independent defects. The 22% in four months is value front-loading, which may have a legitimate explanation in equipment payments but must be justified. The far more serious issue is the manpower peak at month 28 of 30: it means the bulk of physical work is planned for the window when testing, commissioning, punch-listing and handover are competing for the same fronts and access, with no recovery time remaining. That is not resourceable. Option (a) accepts one explanation while ignoring the second defect entirely; (c) treats the histogram as a presentational fix when it is the symptom of the plan itself; (d) is wrong on theory — linear curves are a defect, not a target."}
},

/* ========================================================================== *
 *  LEVEL 3 — MEASURE AND CONTROL
 * ========================================================================== */

{id:"L12", lvl:3, t:"Earned value from first principles",
 sub:"PV, EV and AC, the definition people get wrong, the indices, the 2×2 diagnosis, and the forecast family",
 body:[
  {p:"Earned value is the only technique that measures cost and schedule performance in the same units at the same time. It is also the technique most often quoted by people who have the central definition wrong. Get the three base quantities right and everything else is division."},

  {h:"The three quantities"},
  {tbl:[["Term","Full name","Plain English"],[
   ["<b>PV</b>","Planned Value (BCWS)","What we <i>said</i> we would have done by now, in budget"],
   ["<b>EV</b>","Earned Value (BCWP)","What we <i>have</i> done, valued at budget"],
   ["<b>AC</b>","Actual Cost (ACWP)","What we <i>spent</i> doing it"]
  ]]},
  {warn:["The definition people get wrong","Earned value is the <b>budgeted cost of work performed</b>. It is measured <i>in budget</i>, never in spend. If you completed an activity budgeted at AED 100,000 and it cost you AED 160,000, you have earned <b>100,000</b> — not 160,000. The overspend appears in AC, which is where it belongs. Confusing EV with spend makes CPI permanently equal to 1.00 and destroys the entire technique. This is the single most common error in the subject."]},
  {ig:"evm3"},
  {p:"Notice that EV requires a progress measurement basis — a rule of credit. This is why Lesson 9 came first. Earned value is not a separate system bolted onto a schedule; it is weightage multiplied by budget."},

  {h:"Variances"},
  {fx:"SV = EV − PV      Schedule Variance   (currency)\nCV = EV − AC      Cost Variance       (currency)\n\nNegative is bad in both cases.\nBoth are differences, so both are in money."},

  {h:"Indices"},
  {fx:"SPI = EV ÷ PV     Schedule Performance Index\nCPI = EV ÷ AC     Cost Performance Index\n\n<b>Above 1.00 is good for both.</b>\nCPI is COST. SPI is SCHEDULE. The denominator tells you which."},
  {p:"A memory hook that survives interview pressure: the denominator names the index. Divide by <b>A</b>ctual <b>C</b>ost and you get the <b>C</b>ost index. Divide by <b>P</b>lanned <b>V</b>alue and you get the <b>S</b>chedule index — because planned value is a statement about the plan, which is a statement about time."},
  {p:"A CPI of 0.90 means you are getting 90 fils of budgeted work for every dirham spent. An SPI of 0.90 means you have achieved 90% of the value you planned to have achieved by now."},
  {w:"evm"},

  {h:"The 2×2 diagnosis"},
  {p:"Two indices, two directions each, four situations. Each has a different management response, and naming the quadrant correctly is most of the analysis."},
  {ig:"evmquad"},
  {tbl:[["Quadrant","Reading","Likely cause","Response"],[
   ["<b>SPI &gt;1, CPI &gt;1</b>","Ahead and under budget","Genuinely good, or the baseline was soft, or progress is overstated","Verify the progress claim before celebrating"],
   ["<b>SPI &lt;1, CPI &gt;1</b>","Behind but under budget","Under-resourced — not enough people to hit the dates","Add resource. You have the budget headroom to do it"],
   ["<b>SPI &gt;1, CPI &lt;1</b>","Ahead but over budget","Buying the schedule — overtime, extra crews, premium logistics","Deliberate acceleration is fine if it is a decision, dangerous if it is a drift"],
   ["<b>SPI &lt;1, CPI &lt;1</b>","Behind and over budget","Productivity failure, rework, poor estimate, or disruption","The serious quadrant. Find the cause before forecasting"]
  ]]},
  {ok:["The quadrant that catches people out","SPI &lt;1 with CPI &gt;1 reads like half-good news and is usually the easiest to fix — you are simply not spending fast enough because you have not mobilised enough people. It is the one quadrant where the answer is genuinely 'add resource', and the budget position says you can afford to."]},

  {h:"Forecasting: the EAC family"},
  {def:["EAC — Estimate at Completion","The forecast total cost of the project when it is finished. There is more than one formula because there is more than one assumption you can make about the future."]},
  {fx:"1. Past variance was a one-off — future work at budget rate:\n   EAC = AC + ( BAC − EV )\n\n2. Past performance continues — the standard forecast:\n   EAC = BAC ÷ CPI\n\n3. Cost and schedule pressure both persist — pessimistic:\n   EAC = AC + ( BAC − EV ) ÷ ( CPI × SPI )"},
  {p:"Formula 2 is the workhorse and the one to quote if asked for a single number. Formula 1 is only defensible when you can name the one-off event and show it is closed. Formula 3 is used when schedule pressure is itself driving cost — overtime, acceleration, extended preliminaries — which is common on a project that is both late and overspent."},
  {fx:"ETC = EAC − AC          Estimate to Complete (what remains to be spent)\nVAC = BAC − EAC          Variance at Completion (negative = overrun)"},

  {h:"TCPI — the reality check"},
  {def:["TCPI — To Complete Performance Index","The cost efficiency that must be achieved on all remaining work in order to finish within a given target."]},
  {fx:"To hit the original budget:   TCPI = ( BAC − EV ) ÷ ( BAC − AC )\nTo hit the revised forecast:  TCPI = ( BAC − EV ) ÷ ( EAC − AC )"},
  {p:"TCPI is the honesty instrument in the toolkit. If your CPI has been 0.88 for eight months and TCPI to recover the budget is 1.19, you are being asked to believe that a team which has never exceeded 0.88 will now sustain 1.19 for the remainder. That is not a forecast; it is a wish."},
  {tip:["The rule of thumb worth carrying","If TCPI exceeds CPI by more than about 0.10, recovery to that target is not realistic without a structural change — a scope reduction, a method change, or an agreed budget increase. Saying so early is what senior planners are paid for. Saying it late is what ends careers."]},
  {say:["A project controls director","Anyone can produce an EAC. What I am paying for is the sentence that comes after it — whether we can still get there, and what would have to be true."]}
 ],
 check:{type:"calc",
  q:"A package has BAC AED 8,000,000. At the data date: PV = 4,200,000, EV = 3,600,000, AC = 4,320,000. <b>Using the standard forecast that past cost performance continues, what is the Estimate at Completion?</b> Give your answer in AED.",
  a:9600000, tol:20000, unit:"AED",
  hint:"First compute CPI from the two quantities that describe cost. Then apply the standard EAC formula — the one that assumes the performance you have seen so far is the performance you will keep getting.",
  why:"CPI = EV ÷ AC = 3,600,000 ÷ 4,320,000 = 0.8333. EAC = BAC ÷ CPI = 8,000,000 ÷ 0.8333 = AED 9,600,000. VAC = BAC − EAC = −1,600,000, a 20% overrun. Check the other indices while you are here: SPI = 3,600,000 ÷ 4,200,000 = 0.857, so the package is also behind — this is the SPI<1, CPI<1 quadrant, the serious one. TCPI to recover the original budget would be (8,000,000 − 3,600,000) ÷ (8,000,000 − 4,320,000) = 1.196, against a demonstrated CPI of 0.833. That gap of 0.36 says recovery to budget is not credible."}
},

{id:"L13", lvl:3, t:"Earned Schedule",
 sub:"Why SPI converges to 1.00, ES, SV(t), SPI(t), IEAC(t), and the relationship to the critical path",
 body:[
  {p:"Conventional earned value has one structural flaw, and it is a serious one: its schedule indicator is measured in money. Earned Schedule fixes it by measuring schedule performance in time, which is the unit the question was asked in."},

  {h:"The flaw: SPI always converges to 1.00"},
  {p:"Consider a project that finishes six months late. On the day it completes, all the work has been done, so EV = BAC. The plan also called for all the work, so at the end PV = BAC. Therefore:"},
  {fx:"At completion:   SPI = EV ÷ PV = BAC ÷ BAC = <b>1.00</b>\n\nA project six months late reports perfect schedule performance\non its final day. And SV = EV − PV = 0."},
  {p:"This is not an edge case. The convergence begins well before completion — as the project passes roughly two-thirds of its duration, PV flattens toward BAC while EV continues to climb, and SPI drifts upward toward 1.00 regardless of how late the project actually is. <b>SPI becomes progressively less reliable in the final third of a project, which is exactly when you most need it.</b>"},
  {ig:"spiconverge"},
  {warn:["The interview question hidden here","'At month 20 of 24, SPI is 0.97. Is the project nearly on time?' The correct answer is: I cannot tell from SPI alone at this stage, because SPI converges to 1.00 as the project approaches completion whether or not it is late. I would compute Earned Schedule and report SPI(t). The Level 3 review asks exactly this."]},

  {h:"The idea: read the horizontal gap"},
  {p:"Earned Schedule asks a different question. Instead of \"how much value are we behind?\" it asks: <b>at what point in time did the baseline plan to have achieved the value we have achieved today?</b> That point is the Earned Schedule, and the distance from there to today is the schedule delay — in time."},
  {def:["Earned Schedule (ES)","The point on the time axis at which the planned value curve equals the earned value achieved today. Expressed in the same time units as the project."]},
  {ig:"esgap"},
  {fx:"ES  = C + I     where\n      C = the last whole period in which PV ≤ EV(now)\n      I = ( EV(now) − PV(C) ) ÷ ( PV(C+1) − PV(C) )     the interpolated fraction\n\nAT      = Actual Time — periods elapsed to the data date\nSV(t)   = ES − AT                schedule variance in TIME\nSPI(t)  = ES ÷ AT                schedule performance index in TIME\nIEAC(t) = PD ÷ SPI(t)            forecast total duration; PD = planned duration"},

  {h:"Worked example"},
  {p:"A 24-month project. At month 14 (AT = 14), EV = AED 41.0 million. The baseline planned value curve gives:"},
  {tbl:[["Month","Cumulative PV (AED m)"],[
   ["9","36.0"],["10","40.0"],["11","45.0"],["12","51.0"],["13","57.5"],["14","64.0"]
  ]]},
  {ol:[
   "Find the last whole month where PV ≤ 41.0. PV(10) = 40.0 ≤ 41.0, and PV(11) = 45.0 &gt; 41.0. So <b>C = 10</b>.",
   "Interpolate: I = (41.0 − 40.0) ÷ (45.0 − 40.0) = 1.0 ÷ 5.0 = <b>0.20</b>.",
   "<b>ES = 10.20 months.</b>",
   "SV(t) = 10.20 − 14 = <b>−3.80 months behind</b>.",
   "SPI(t) = 10.20 ÷ 14 = <b>0.729</b>.",
   "IEAC(t) = 24 ÷ 0.729 = <b>32.9 months</b> — a forecast overrun of about 8.9 months."
  ]},
  {p:"Now compare with the conventional index at the same data date: SPI = EV ÷ PV = 41.0 ÷ 64.0 = 0.64. Both say the project is behind, but only Earned Schedule says <b>3.8 months behind, finishing around month 33</b>. That is a sentence that can be put in front of a board."},
  {w:"es"},

  {h:"Reading SPI(t)"},
  {tbl:[["SPI(t)","Meaning"],[
   ["1.00","On time"],
   ["0.90","Achieving 90% of planned time progress — roughly 10% behind in duration terms"],
   ["&lt;0.85","Serious. Forecast overrun of 18% or more on duration"],
   ["&gt;1.00","Genuinely ahead of programme"]
  ]]},
  {ok:["Why SPI(t) does not converge","SPI(t) = ES ÷ AT. If the project finishes at month 33 having planned 24, then at completion ES = 24 and AT = 33, giving SPI(t) = 0.727 — it correctly reports the project as late right to the final day. The denominator is elapsed time, which keeps growing, rather than planned value, which flattens out."]},

  {h:"Relationship to the critical path"},
  {p:"Earned Schedule and critical path analysis answer different questions and you need both. This is worth being precise about, because a common criticism of ES is that it \"ignores the critical path\" — which is true and is not a defect, provided you understand what each tool is for."},
  {tbl:[["","Earned Schedule","Critical path (CPM)"],[
   ["Measures","Whole-project performance against the plan","Which specific chain drives the completion date"],
   ["Aggregation","Aggregated across all work","Path-specific"],
   ["Blind spot","Cannot tell you <i>which</i> activities are late","Cannot tell you the overall rate of progress"],
   ["Good for","Trend, forecast duration, early warning","Recovery targeting, entitlement analysis"]
  ]]},
  {p:"The practical failure mode: a project can have SPI(t) = 0.95 — broadly healthy overall — while its critical path is 60 days in delay, because a mass of non-critical work is progressing well and masking one failing chain. The reverse also occurs. Report both, and when they disagree, say so and investigate: the disagreement is itself the finding."},
  {tip:["Where Earned Schedule earns its place","Use IEAC(t) as an independent, data-driven challenge to the CPM forecast finish date. If the network says 26 months and ES says 33, someone has been optimistic with remaining durations. That single comparison is one of the most valuable checks in project controls, and it takes two minutes."]}
 ],
 check:{type:"calc",
  q:"A 30-month project. At month 18, EV equals the value the baseline planned to have earned by <b>month 13.5</b>. <b>What is IEAC(t) — the forecast total project duration in months?</b> Give your answer to one decimal place.",
  a:40.0, tol:0.3, unit:"months",
  hint:"ES is given to you directly — it is the point on the plan where your earned value sits. Compute SPI(t) from ES and actual time, then scale the planned duration by it.",
  why:"ES = 13.5, AT = 18, so SPI(t) = 13.5 ÷ 18 = 0.75. IEAC(t) = PD ÷ SPI(t) = 30 ÷ 0.75 = 40.0 months — a forecast overrun of 10 months. SV(t) = 13.5 − 18 = −4.5 months behind at the data date. Note the leverage: being 4.5 months behind at month 18 forecasts a 10-month overrun, because the same rate of progress applied to the remaining work costs proportionally more time. This is why early ES trend is a powerful warning signal — the forecast overrun is always larger than the delay incurred so far, provided performance does not change."}
},

{id:"L14", lvl:3, t:"Schedule quality and the DCMA 14-point assessment",
 sub:"All fourteen checks with thresholds, CPLI and BEI, the 600-day test, and why passing is not the point",
 body:[
  {p:"The DCMA 14-point assessment originated with the US Defense Contract Management Agency as a mechanical screen for schedule health. It has become the de facto standard on major EPC and infrastructure projects worldwide, and it is the checklist a client reviewer will run against your baseline. Knowing all fourteen and their thresholds is expected of a senior planner."},

  {h:"The fourteen checks"},
  {ig:"dcma"},
  {tbl:[["#","Test","Threshold","What it detects"],[
   ["1","<b>Logic</b>","≤ 5% missing predecessor or successor","Open ends — activities floating free of the network"],
   ["2","<b>Leads</b> (negative lags)","<b>0%</b>","Relationships that break the backward pass"],
   ["3","<b>Lags</b>","≤ 5% of relationships","Waiting time hiding real work"],
   ["4","<b>Relationship types</b>","≥ 90% Finish-to-Start","Over-use of SS/FF to force a shape"],
   ["5","<b>Hard constraints</b>","≤ 5%","Dates imposed over logic; the network stops calculating"],
   ["6","<b>High float</b>","≤ 5% with TF &gt; 44 days","Disconnected or under-linked work"],
   ["7","<b>Negative float</b>","<b>0 activities</b>","Work already behind an imposed date"],
   ["8","<b>High duration</b>","≤ 5% with duration &gt; 44 days","Activities too long to control"],
   ["9","<b>Invalid dates</b>","<b>0</b>","Forecast dates before the data date, or actuals after it"],
   ["10","<b>Resources</b>","All activities with duration &gt; 0 loaded","Unresourced work in a resource-loaded programme"],
   ["11","<b>Missed tasks</b>","≤ 5%","Activities finishing later than baseline — slippage rate"],
   ["12","<b>Critical path test</b>","Finish must move by the injected amount","Whether the network actually calculates"],
   ["13","<b>Critical Path Length Index (CPLI)</b>","≥ 0.95","Realism of the critical path against the target date"],
   ["14","<b>Baseline Execution Index (BEI)</b>","≥ 0.95","Whether tasks are being completed at the planned rate"]
  ]]},
  {w:"dcma"},

  {h:"Test 12 — the 600-day test"},
  {p:"This is the cleverest of the fourteen and the one most worth understanding, because it is the only test that verifies the network <b>works</b> rather than that it looks tidy."},
  {ol:[
   "Take a copy of the programme. Never do this in the live file.",
   "Find an activity on the critical path, well upstream.",
   "Add 600 days to its remaining duration.",
   "Reschedule.",
   "The project finish date must move out by approximately 600 days."
  ]},
  {p:"If it moves by 600 days, the network is continuous and the critical path is real. If it moves by 340 days, or by nothing at all, something is absorbing the impact — a constraint, an open end, a broken chain, or a calendar anomaly. <b>That means the completion date is not being driven by logic, and every float value in the file is suspect.</b>"},
  {ok:["Why 600","The number is arbitrary but deliberately large. It must exceed any float anywhere in the network so that nothing can absorb it, and it must be big enough that a partial absorption is obvious rather than a rounding difference. Use the copy, run it, throw the copy away."]},

  {h:"CPLI — is the critical path realistic?"},
  {fx:"CPLI = ( Critical Path Length + Total Float to the target ) ÷ Critical Path Length\n\nCritical path length = working days from data date to contract finish\nTotal float          = float on the driving path to that finish milestone"},
  {p:"CPLI of exactly 1.00 means the critical path arrives precisely on the required date with no float and no negative float. Above 1.00 means positive float — you have room. Below 1.00 means the path is already late against the target."},
  {fx:"Critical path length = 220 days\nTotal float on it    = −15 days\n\nCPLI = ( 220 + (−15) ) ÷ 220 = 205 ÷ 220 = <b>0.93</b>   FAIL (&lt; 0.95)\n\nRead as: about 7% more time is needed than remains available."},

  {h:"BEI — are tasks actually being completed?"},
  {fx:"BEI = ( Number of tasks actually completed ) ÷ ( Number of tasks baselined to be complete by the data date )"},
  {p:"BEI is a blunt throughput measure and its bluntness is the point — it is very hard to manipulate. A BEI of 0.80 means only four out of every five tasks that should have finished have finished. It is not weighted by value or duration, so it will not tell you whether the missing fifth is trivial or catastrophic, but it gives an early, honest signal of execution rate that percent-complete reporting can mask."},
  {tbl:[["BEI","Reading"],[
   ["≥ 1.00","Completing tasks at or ahead of the baseline rate"],
   ["0.95 – 1.00","Acceptable"],
   ["0.80 – 0.95","Falling behind; investigate whether the shortfall is concentrated"],
   ["&lt; 0.80","Execution is failing. Percent-complete figures should be treated with suspicion"]
  ]]},

  {h:"Why passing is not the point"},
  {p:"The fourteen tests are a screen for <b>mechanical</b> health. They cannot detect the failures that actually sink projects."},
  {ul:[
   "Logic that is present, valid and <b>wrong</b> — sequence that does not match the construction method",
   "Durations that are internally consistent and <b>unachievable</b>",
   "A resource histogram requiring 700 people on a site that accommodates 300",
   "A completion date that is arithmetically sound and commercially impossible"
  ]},
  {warn:["Gaming the tests","Every failure has a cosmetic fix. Too many open ends — link everything to the finish milestone. Too much high float — add constraints. Too many long activities — split them arbitrarily at day 44. Each fix passes the test and degrades the programme. A reviewer who sees 200 activities all linked directly to project completion knows exactly what happened, and now doubts everything else in the file. Use the tests to find real defects, then fix the defect, not the metric."]},
  {say:["A senior planning manager","A programme that passes all fourteen is not a good programme. It is a programme with no obvious excuses left, which is where the real review starts."]},
  {tip:["Submit your own report","Run the assessment yourself before submission and issue the results with the baseline, with a written justification for every failure. Reviewers reject surprises. They accept explained exceptions."]}
 ],
 check:{type:"calc",
  q:"A programme has 210 working days remaining from data date to the contract completion milestone. The total float on the driving path to that milestone is <b>−11 days</b>. <b>Calculate CPLI</b> to two decimal places.",
  a:0.95, tol:0.006, unit:"",
  hint:"Add the float to the path length — remembering the float is negative — then divide by the path length. Watch the sign.",
  why:"CPLI = (210 + (−11)) ÷ 210 = 199 ÷ 210 = 0.9476, which rounds to 0.95. This sits exactly on the threshold and would be reported as a marginal pass — but a reviewer will read it as a project with no float and 11 days of negative float on its driving path, which in practice means it is already late against the contract date. The useful habit is to report CPLI alongside the raw float figure, because 0.95 sounds acceptable while '11 days of negative float on the critical path' does not, and they are the same fact."}
},

{id:"L15", lvl:3, t:"Risk, PERT and contingency",
 sub:"Three-point estimating, te and SD, why variances add, Monte Carlo, P-values, criticality index and where contingency lives",
 body:[
  {p:"Every duration in a programme is a single number standing in for a range of possible outcomes. Risk analysis is the discipline of admitting that, quantifying the range, and deciding how much protection the project needs — held somewhere it can be governed rather than scattered invisibly through the activities."},

  {h:"Three-point estimating"},
  {p:"Instead of one duration, capture three."},
  {ul:[
   "<b>O — Optimistic.</b> Everything goes right. Roughly a 1-in-10 outcome, not a fantasy.",
   "<b>M — Most likely.</b> The single most probable duration. This is the number people would have given you anyway.",
   "<b>P — Pessimistic.</b> Realistic things go wrong. Not the meteor strike — the late permit, the failed test, the rain."
  ]},
  {fx:"te = ( O + 4M + P ) ÷ 6            expected duration (Beta / PERT)\nSD = ( P − O ) ÷ 6                 standard deviation\nVariance = SD²"},
  {p:"The weighting of 4 on the most likely value is what makes this the Beta distribution rather than a simple average. It respects the practitioner's judgement while allowing the tails to pull the expected value — and the pull is asymmetric, which is the whole point, because real durations have a floor and no ceiling."},
  {fx:"GIS bay installation:\n  O = 18 days,  M = 24 days,  P = 42 days\n\n  te = (18 + 4×24 + 42) ÷ 6 = (18 + 96 + 42) ÷ 6 = 156 ÷ 6 = <b>26 days</b>\n  SD = (42 − 18) ÷ 6 = 24 ÷ 6 = <b>4 days</b>\n\nThe expected duration is 26, not the 24 people would have used.\nThat 2-day difference is the cost of the long tail, made visible."},
  {w:"pert"},

  {h:"PERT the technique versus PERT the chart"},
  {warn:["A distinction that is asked in interviews","<b>PERT the technique</b> is three-point estimating — te, SD, and probabilistic duration. <b>A PERT chart</b> is a network diagram: boxes and arrows showing activity dependencies. They share a name and an origin (the US Navy Polaris programme, 1958) and are otherwise unrelated. Describing a network diagram as 'doing PERT analysis' is a common and revealing error."]},

  {h:"Variances add — standard deviations do not"},
  {p:"This is the piece of statistics that separates people who apply PERT correctly from people who apply it plausibly and wrongly. To find the standard deviation of a whole path, you cannot add the individual standard deviations."},
  {fx:"WRONG:   SD(path) = SD₁ + SD₂ + SD₃\n\nRIGHT:   Variance(path) = SD₁² + SD₂² + SD₃²\n         SD(path)       = √( Variance(path) )"},
  {fx:"Three activities in series:\n  A: te = 26,  SD = 4      variance = 16\n  B: te = 15,  SD = 2      variance =  4\n  C: te = 30,  SD = 5      variance = 25\n                          ──────────────\n  Path te  = 26 + 15 + 30 = <b>71 days</b>   (durations DO add)\n  Variance = 16 + 4 + 25   = <b>45</b>\n  SD(path) = √45           = <b>6.7 days</b>\n\nAdding the SDs would have given 4 + 2 + 5 = 11 days —\nover-stating the path uncertainty by 64%."},
  {p:"The reason is that the individual variations are independent: some activities will run long while others run short, and the offsetting is real. Adding standard deviations assumes every activity goes wrong simultaneously, which is a different — and much rarer — scenario."},
  {p:"With the path expected duration at 71 days and SD 6.7 days, and assuming approximate normality across a path of several activities, roughly 68% of outcomes fall within ±1 SD (64 to 78 days) and about 95% within ±2 SD (58 to 84 days)."},

  {h:"Monte Carlo simulation"},
  {p:"PERT arithmetic handles one path. Real networks have many paths that merge, and merging is where uncertainty compounds — a milestone fed by four paths cannot start until the latest of them arrives, so the probability of being on time is the probability that <i>all four</i> are on time. This is <b>merge bias</b>, and it systematically makes deterministic schedules optimistic."},
  {p:"Monte Carlo handles it by running the network thousands of times, sampling a duration from each activity's distribution each run, and recording the completion date. The output is a distribution rather than a date."},
  {ig:"montecarlo"},
  {tbl:[["Confidence","Meaning","Typical use"],[
   ["<b>P50</b>","50% chance of finishing on or before","The realistic internal target. Half the runs finish later"],
   ["<b>P80</b>","80% chance","The common commitment level for a client-facing date"],
   ["<b>P90</b>","90% chance","High-consequence or heavily penalised milestones"]
  ]]},
  {p:"The gap between P50 and P80 <b>is</b> the schedule contingency. If P50 is month 26 and P80 is month 29, the project needs three months of time contingency to commit to an 80% confidence date. That is a defensible, arithmetic answer to a question usually settled by argument."},
  {def:["Criticality index","The percentage of Monte Carlo iterations in which a given activity appears on the critical path. An activity at 70% criticality is on the critical path in 70% of simulated futures."]},
  {p:"The criticality index frequently exposes risk that deterministic CPM cannot see. An activity with 15 days of float but a very wide duration range may show a 60% criticality index — meaning that in most plausible futures it is driving the project, despite showing comfortable float in the single-point schedule. Those are the activities to manage, and no amount of staring at the Gantt chart will reveal them."},

  {h:"Where contingency should live"},
  {ok:["Held centrally, visibly, and released deliberately","Contingency belongs at project level as an identified buffer — a schedule reserve activity before the completion milestone, and a cost reserve line — owned by the project manager and released against defined criteria. Never distribute it into individual activity durations. Hidden contingency cannot be measured, cannot be reallocated from the risks that did not happen to the risks that did, and will be consumed by Parkinson's law before the risk it was protecting against ever arrives."]},
  {warn:["The one thing clients notice immediately","A visible contingency buffer before the completion milestone invites the question 'why do you need that?' — and many contractors hide it for exactly that reason. Hiding it is the wrong trade. A contractor who can say 'we hold 22 working days of schedule reserve, sized from a Monte Carlo run at P80, and here is the register of risks it covers' is in a far stronger position than one whose durations are quietly inflated and who cannot explain any of them under scrutiny."]}
 ],
 check:{type:"calc",
  q:"Two activities in series. Activity A: O=10, M=14, P=24. Activity B: O=6, M=8, P=16. <b>What is the standard deviation of the two-activity path?</b> Give your answer in days to one decimal place.",
  a:3.0, tol:0.08, unit:"days",
  hint:"Compute each SD with (P−O)÷6 first. Then remember what adds along a path — it is not the standard deviations.",
  why:"SD(A) = (24 − 10) ÷ 6 = 2.333, variance 5.444. SD(B) = (16 − 6) ÷ 6 = 1.667, variance 2.778. Variances add: 5.444 + 2.778 = 8.222. SD(path) = √8.222 = 2.867, which rounds to 2.9 — and to one decimal with rounding of the intermediate figures most practitioners will report 2.9 to 3.0 days. Adding the standard deviations directly would give 2.333 + 1.667 = 4.0 days, overstating path uncertainty by roughly 40%. For completeness the path expected duration is te(A) + te(B) = 15.0 + 9.0 = 24.0 days, since expected durations do add."}
},

{id:"L16", lvl:3, t:"Recovery, acceleration, crashing and fast-tracking",
 sub:"Recovery versus revised versus mitigation, crash cost optimisation, re-sequencing, and what a submission contains",
 body:[
  {p:"Every project eventually needs this lesson. The distinction that matters commercially is not how you go faster — it is <b>who asked</b>, because that determines who pays."},

  {h:"Three different documents"},
  {ig:"recovery"},
  {tbl:[["","Recovery schedule","Revised baseline","Mitigation / acceleration plan"],[
   ["Triggered by","Contractor culpable delay","Approved variation or granted EOT","Client instruction to accelerate"],
   ["Completion date","Unchanged — contract date retained","Moves to the new approved date","Often earlier than current forecast"],
   ["Measured against","The <b>original</b> baseline","Itself, once approved","The current programme"],
   ["Who pays","The contractor","N/A — scope or time formally changed","The client, if properly instructed"],
   ["Common name for it","Get-well plan","Rebaseline","Constructive or directed acceleration"]
  ]]},
  {warn:["The most expensive confusion in the subject","A contractor who accelerates in response to client pressure, without a written instruction and without reserving its position, is likely to be found to have accelerated voluntarily — and will pay for it. If the client refuses a properly notified extension of time and the contractor then accelerates to protect the date, that may be <b>constructive acceleration</b>, which can be recoverable — but it depends on a chain of contemporaneous evidence: valid notice, entitlement demonstrated, refusal or failure to grant, acceleration reasonably incurred. Notify, price it, reserve rights, then accelerate. In that order."]},

  {h:"Crashing"},
  {def:["Crashing","Shortening the duration of critical activities by adding resource, accepting the additional cost. Logic is unchanged; only durations and resources move."]},
  {p:"Crashing is a cost-optimisation problem with a simple rule: <b>buy the cheapest days first, and only on the critical path.</b> Accelerating a non-critical activity costs money and saves nothing."},
  {fx:"Cost slope = ( Crash cost − Normal cost ) ÷ ( Normal duration − Crash duration )\n\n           = cost per day saved"},
  {tbl:[["Activity","Normal","Crash","Max days","Cost slope (AED/day)","Critical?"],[
   ["Foundations","40 d","32 d","8","18,000","<b>Yes</b>"],
   ["GIS erection","55 d","45 d","10","31,000","<b>Yes</b>"],
   ["Control building","30 d","24 d","6","12,000","No — 14 d float"],
   ["Cabling","35 d","28 d","7","24,000","<b>Yes</b>"]
  ]]},
  {p:"To save 12 days: take all 8 from foundations at AED 18,000/day (AED 144,000), then 4 from cabling at AED 24,000/day (AED 96,000). Total AED 240,000. The control building is cheapest per day and is <b>excluded</b> because it is not critical — spending AED 12,000/day there buys nothing at all."},
  {w:"crash"},
  {warn:["The critical path moves while you crash","Compress the critical path enough and a parallel near-critical chain becomes critical. Beyond that point further crashing on the original path saves nothing. Recalculate after every increment — this is where automated crashing tools mislead people, and it is the trap built into this lesson's widget challenge."]},

  {h:"Fast-tracking"},
  {def:["Fast-tracking","Overlapping activities that were planned in sequence. Logic is changed; durations and resources are unchanged."]},
  {p:"Fast-tracking is free in cash terms and expensive in risk. Starting foundations before design is fully approved buys weeks and accepts the possibility of rework if the design changes. It is the correct first move when schedule matters more than certainty, and it must be a conscious, recorded decision rather than a drift."},
  {tbl:[["","Crashing","Fast-tracking"],[
   ["Changes","Durations, resources","Logic"],
   ["Costs","Money, directly","Risk of rework"],
   ["Limit","Physical crew capacity and work-front space","How much of the predecessor's output the successor truly needs"],
   ["Reversible","Yes — demobilise","Hard — rework is already committed"]
  ]]},

  {h:"Re-sequencing and re-scoping"},
  {p:"Two options that are less discussed and often more effective than either of the above."},
  {ul:[
   "<b>Re-sequencing</b> — change the order of work to open a different front. Energise Bay 3 first instead of Bay 1 because its cable route is clear. Costs nothing but planning effort, and is frequently the best available move.",
   "<b>Re-scoping</b> — reduce or defer scope by agreement. Take partial handover of the completed section, defer non-essential works to the defects period, split the taking-over certificate. This is a commercial negotiation rather than a planning technique, but the planner has to model it before anyone can decide."
  ]},
  {ok:["The order to try things in","Re-sequence first — it is free. Then fast-track where the risk is acceptable. Then crash, cheapest critical days first. Then re-scope by agreement. Crashing is third on the list, not first, because it is the only one that immediately consumes cash."]},

  {h:"What a recovery submission contains"},
  {ol:[
   "<b>Statement of the current position</b> — days of delay, against which baseline, measured how",
   "<b>Cause analysis</b> — what caused each element of the delay, with the responsible party identified honestly",
   "<b>The recovery programme itself</b> — showing the original contract completion date restored",
   "<b>Method of recovery</b> — activity by activity: which are crashed, which fast-tracked, which re-sequenced",
   "<b>Resource evidence</b> — histograms and a mobilisation plan showing the additional crews genuinely exist and can be housed and permitted",
   "<b>Cost of recovery</b> — and a clear statement of who is bearing it",
   "<b>Risk assessment</b> — what the recovery plan itself introduces, particularly rework exposure from fast-tracking",
   "<b>Reservation of rights</b> — where the contractor is recovering while maintaining a claim for events it says are the client's responsibility"
  ]},
  {say:["A client project director","Every recovery plan I am handed shows the original date restored. That is the easy part — it is what the client asked for. The only question I actually have is whether the manpower curve behind it is real, and I check that first."]},
  {tip:["The test a recovery plan must pass","Compare the recovery histogram against the original. If it requires 2.4 times the peak manpower with no explanation of where those people come from, where they sleep and how they are permitted, it is a drawing, not a plan. Reviewers reject on the histogram more often than on the logic."]}
 ],
 check:{type:"calc",
  q:"You must save <b>10 days</b>. Available: <b>Piling</b> — critical, up to 6 days at AED 22,000/day. <b>Steel erection</b> — critical, up to 8 days at AED 35,000/day. <b>Fencing</b> — 20 days float, up to 10 days at AED 9,000/day. <b>What is the minimum cost to save 10 days?</b> Give your answer in AED.",
  a:272000, tol:500, unit:"AED",
  hint:"Fencing is the cheapest per day. Before you use it, ask what crashing a non-critical activity does to the project completion date.",
  why:"Fencing has 20 days of float, so compressing it saves the project nothing — it is excluded no matter how cheap it is. Buy the cheapest critical days first: all 6 days of piling at 22,000 = AED 132,000, then the remaining 4 days from steel erection at 35,000 = AED 140,000. Total AED 272,000. The AED 9,000/day fencing option is the deliberate trap: cost-per-day comparisons are only meaningful among activities that actually drive the completion date. In practice you would also re-run the critical path after taking 6 days from piling, in case a near-critical chain has become critical and capped the saving."}
},

/* ========================================================================== *
 *  LEVEL 4 — COMMERCIAL AND FORENSIC
 * ========================================================================== */

{id:"L17", lvl:4, t:"Contracts for planners",
 sub:"FIDIC Red, Yellow and Silver, the eight clauses that matter, the 28-day notice trap, and time at large",
 body:[
  {p:"A planner who does not read the contract is producing a technical document with no commercial meaning. Every programme obligation, every notice deadline and every entitlement to more time is defined in the contract, and the arithmetic in your schedule only converts into money through those clauses."},

  {h:"The FIDIC family"},
  {p:"FIDIC produces standard forms distinguished by <b>who designs</b> and <b>who carries the risk</b>. On power and infrastructure work in the Gulf you will meet all three, usually heavily amended."},
  {tbl:[["Book","Full title","Design by","Risk profile","Typical use"],[
   ["<b>Red</b>","Construction","<b>Employer</b>","Employer keeps design risk; measured or lump sum","Civil works, buildings, employer-designed substations"],
   ["<b>Yellow</b>","Plant &amp; Design-Build","<b>Contractor</b>","Shared; contractor takes design","EPC substations, plant, process facilities"],
   ["<b>Silver</b>","EPC / Turnkey","<b>Contractor</b>","<b>Contractor takes almost everything</b>, including most ground and unforeseen risk","Turnkey power plants, privately financed projects"]
  ]]},
  {p:"The Silver Book matters most to planners because its risk transfer is severe: the grounds on which a contractor can obtain more time are materially narrower than under Red or Yellow. If you are planning a Silver Book job, assume that most things that go wrong are yours until the contract says otherwise."},
  {ig:"fidic"},

  {h:"The eight clauses that matter"},
  {p:"FIDIC 1999 numbering, with the 2017 equivalents where they moved. Learn both — 1999 remains extremely common in the region while 2017 is increasingly used."},
  {tbl:[["1999","2017","Clause","Why the planner cares"],[
   ["<b>8.3</b>","8.3","Programme","Your obligation to submit, its required content and the timescale. Non-compliance here undermines everything downstream"],
   ["<b>8.4</b>","<b>8.5</b>","Extension of Time for Completion","The grounds for more time. The clause your delay analysis serves"],
   ["8.7","8.8","Delay Damages","Liquidated damages — the rate per day and the cap. What delay costs"],
   ["<b>20.1</b>","<b>20.2</b>","Claims","The <b>28-day notice</b> and the particulars that follow. The clause that kills valid claims"],
   ["2.1","2.1","Right of Access to the Site","Late access is one of the most common compensable client delays"],
   ["4.21","4.20","Progress Reports","Monthly reporting obligations — content and timing"],
   ["13","13","Variations and Adjustments","How changed scope becomes time and money"],
   ["1.9 / 1.8","1.9","Errors / Delayed Drawings","Late employer information as a ground for time and cost"]
  ]]},
  {ok:["The 8.3 detail people miss","Sub-Clause 8.3 does not merely require a programme — it typically requires the contractor to notify the Engineer of specific probable future events likely to affect the work, and to submit a revised programme whenever the existing one is inconsistent with actual progress. A contractor who has not updated a programme that everyone knows is out of date is already in breach of 8.3, which weakens every later argument about the same period."]},

  {h:"The 28-day notice trap"},
  {p:"This single provision defeats more genuinely valid claims than any technical failure of analysis."},
  {fx:"FIDIC 1999 Sub-Clause 20.1 / 2017 Sub-Clause 20.2:\n\nNotice within <b>28 days</b> after the Contractor became aware,\nor should have become aware, of the event or circumstance.\n\n\"If the Contractor fails to give notice of a claim within such\nperiod of 28 days, the Time for Completion shall not be extended,\nthe Contractor shall not be entitled to additional payment, and\nthe Employer shall be discharged from all liability...\""},
  {warn:["Three things about the 28 days","<b>It is a condition precedent</b> under standard FIDIC wording — miss it and the entitlement is extinguished regardless of how strong the merits are. <b>The clock runs from awareness, not from impact</b>: it starts when the contractor knew or should have known of the event, which may be months before any delay appears in the programme. <b>Fully detailed particulars are a separate, later deadline</b> — commonly 42 days. The notice itself must be prompt; the substantiation follows."]},
  {p:"Some jurisdictions will look critically at time-bar clauses, and prevention-principle arguments occasionally succeed in defeating them. Do not plan around that. The professional position is simple: <b>notify early, notify often, notify in writing under the correct clause reference.</b> A notice costs nothing. A missed notice costs the claim."},
  {tip:["The habit that protects your employer","Maintain a notice log alongside the delay register: event, date of awareness, notice date, clause referenced, days elapsed. Review it weekly. Anything approaching day 21 without a notice issued goes on the project manager's desk that day. This one routine is worth more than any analytical technique in this level."]},

  {h:"Time at large and the prevention principle"},
  {def:["The prevention principle","An employer cannot hold a contractor to a completion date where the employer itself has prevented completion by that date. If there is no effective mechanism to extend time for an act of prevention, the obligation to complete by the fixed date may fall away."]},
  {p:"Where the principle operates, time becomes <b>at large</b>: the contractor's obligation is no longer to complete by a fixed date but to complete within a reasonable time. Critically, liquidated damages become unenforceable, because there is no date from which to measure them."},
  {p:"It arises rarely, and typically where the employer causes delay but the contract contains no EOT mechanism covering that cause, or where the employer fails to operate the mechanism at all — for example by simply refusing to assess a properly notified claim."},
  {warn:["Do not rely on it","Time at large is a fallback argument, not a strategy. Well-drafted contracts include a sweep-up ground for EOT ('any delay caused by the Employer') precisely to keep time fixed and preserve the liquidated damages regime. A contractor whose position depends on time at large is usually a contractor who failed to notify properly and is looking for a way out."]},

  {h:"Bespoke and amended forms"},
  {p:"In practice you will rarely see unamended FIDIC. Employers in the region routinely issue Particular Conditions that reallocate risk, and it is exactly these amendments that matter to you. Read for six things before you build the programme:"},
  {ol:[
   "<b>Has the notice period been shortened?</b> 28 days sometimes becomes 14. Occasionally 7.",
   "<b>Have EOT grounds been narrowed or deleted?</b> Weather and unforeseen conditions are common casualties.",
   "<b>Is float ownership stated?</b> Many bespoke forms expressly grant float to the project or to the employer.",
   "<b>Is a specific delay-analysis method mandated?</b> Some forms specify time impact analysis, which removes the choice you will study in the next lesson.",
   "<b>What are the programme submission and revision obligations?</b> Frequency, format, native file, level of detail, software version.",
   "<b>Is acceptance of the programme deemed after a period of silence?</b> This cuts both ways and is worth knowing."
  ]},
  {say:["A contracts manager, EPC","The planner is the first person in the organisation to know that an event has happened. If the planner does not know what to do with that knowledge within 28 days, nobody else gets the chance."]}
 ],
 check:{type:"mcq",
  q:"A contractor becomes aware on 3 March that the employer's free-issue transformer will be four months late. The delay does not begin to affect the critical path until 20 June. Under standard FIDIC 1999 Sub-Clause 20.1, when must notice be given?",
  opts:[
   "Within 28 days of 20 June, when the delay first affected the programme",
   "Within 28 days of 3 March, when the contractor became aware of the event",
   "At the next monthly report following the impact",
   "Within 42 days of 3 March, together with fully detailed particulars"
  ],
  a:1,
  hint:"Read the trigger carefully. Does the clause run from the moment of impact, or from the moment of knowledge?",
  why:"The 28 days runs from when the contractor became aware, or should have become aware, of the <i>event or circumstance</i> — not from when it caused measurable delay. The clock started on 3 March, so notice was due by 31 March. Waiting for the impact on 20 June puts the contractor roughly eleven weeks out of time, and under standard FIDIC wording the entitlement to both time and money is extinguished. Option (d) confuses the two deadlines: the notice is due at 28 days, with fully detailed particulars following at 42 days. This is the most valuable single fact in this lesson — notify on knowledge, not on impact."}
},

{id:"L18", lvl:4, t:"Delay analysis: the six methods",
 sub:"The SCL Protocol six, TIA versus Impacted As-Planned, the four steps, AACE RP 29R-03 and how to choose",
 body:[
  {p:"Delay analysis answers one question: of the total delay to completion, how much was caused by what, and who is responsible for each part. There is no single correct method. There is a correct method <i>for the records you have and the question being asked</i>, and being able to justify the choice is the skill."},

  {h:"The two axes"},
  {p:"Every method sits at the intersection of two choices, and naming those two choices tells an expert almost everything about the method."},
  {ig:"delaymatrix"},
  {ul:[
   "<b>Prospective or retrospective</b> — does it model what was <i>expected</i> to happen at the time of the event, or examine what <i>actually</i> happened?",
   "<b>Additive or subtractive</b> — does it <i>insert</i> delay events into a programme to see the effect, or <i>remove</i> them from the as-built to see what would have happened without them?"
  ]},

  {h:"The SCL Protocol six"},
  {p:"The Society of Construction Law Delay and Disruption Protocol (2nd edition, February 2017) identifies six methods. This list is the standard vocabulary in the industry and you should be able to describe all six."},
  {tbl:[["Method","Type","Needs","Strength","Weakness"],[
   ["<b>1. Impacted As-Planned</b>","Prospective, additive","Baseline + event list only","Cheapest and simplest","Ignores as-built reality entirely. Widely criticised, often rejected"],
   ["<b>2. Time Impact Analysis</b>","Prospective, additive","Baseline, updates, events","Contemporaneous; the SCL preference for prospective analysis","Labour intensive; results depend on update quality"],
   ["<b>3. Time Slice Windows</b>","Retrospective, dynamic","Reliable updates through the period","Shows the critical path <i>moving</i> over time","Requires good contemporaneous updates"],
   ["<b>4. As-Planned versus As-Built Windows</b>","Retrospective, observational","As-built records; updates optional","Works when updates are poor or missing","More judgement-based, so more arguable"],
   ["<b>5. Retrospective Longest Path</b>","Retrospective, observational","Complete as-built programme","Identifies the actual driving path to completion","Hindsight-based; ignores what was known at the time"],
   ["<b>6. Collapsed As-Built</b>","Retrospective, subtractive","Robust, logic-linked as-built","Powerful demonstration of but-for causation","Requires as-built logic, which rarely exists and must be inferred"]
  ]]},

  {h:"Time Impact Analysis versus Impacted As-Planned"},
  {p:"These two are constantly confused, and the difference is the single most useful discrimination in this lesson."},
  {tbl:[["","Impacted As-Planned","Time Impact Analysis"],[
   ["Base programme","The <b>original baseline</b>, unchanged","The <b>updated programme</b> immediately before each event"],
   ["Progress considered","<b>None</b>","Yes — actual progress to the date of the event"],
   ["Events","Often all inserted at once","One at a time, in chronological order"],
   ["Reflects","A theoretical world where nothing else happened","The project as it actually stood when the event struck"],
   ["Credibility","Low. Frequently rejected","High. Commonly specified in contracts"]
  ]]},
  {p:"The failure of Impacted As-Planned is easy to state: it inserts a delay into a programme that has already been overtaken by events. If the baseline said the critical path ran through civil works but by month 14 it actually ran through GIS installation, an analysis performed on the untouched baseline will attribute delay to the wrong chain entirely — and will do so with complete internal consistency, which is what makes it dangerous."},
  {w:"tia"},

  {h:"Time Impact Analysis in four steps"},
  {ol:[
   "<b>Select the base programme.</b> Take the accepted programme updated to immediately <i>before</i> the delay event — with actual progress to that date. This is the step that defines the method, and getting it wrong turns TIA into Impacted As-Planned.",
   "<b>Build the delay fragnet.</b> Model the event as a small sub-network of activities with its own logic, and link it into the base programme at the correct points. A fragnet, not a single bar — an event usually has internal sequence.",
   "<b>Reschedule and measure.</b> Recalculate and compare the new projected completion date with the one before insertion. The difference is that event's impact.",
   "<b>Repeat chronologically.</b> Take the next event, update the programme to just before it, insert, measure. Events are assessed in the order they occurred, because each one changes the network the next one lands on."
  ]},
  {ok:["Why chronological order is not optional","The critical path moves during a project. An event in month 6 may change which chain is critical, so an event in month 11 impacts a different network from the one that existed at baseline. Assessing events out of order, or all at once, produces a number that cannot be reconciled with what actually happened — and an opposing expert will demonstrate that in a single slide."]},

  {h:"AACE RP 29R-03 and the nine MIPs"},
  {p:"AACE International Recommended Practice 29R-03, <i>Forensic Schedule Analysis</i>, is the most rigorous taxonomy in the field. It classifies methods along four dimensions and defines nine <b>Method Implementation Protocols</b>."},
  {fx:"Observational  vs  Modelled       — do you watch, or do you simulate?\nStatic        vs  Dynamic        — one fixed programme, or updates over time?\nAdditive      vs  Subtractive    — insert delays, or remove them?\nSingle base   vs  Multiple base  — one programme, or a series of them?"},
  {tbl:[["MIP","Family","Common name"],[
   ["3.1","Observational / static / gross","As-planned vs as-built, whole project"],
   ["3.2","Observational / static / periodic","As-planned vs as-built by windows"],
   ["3.3","Observational / dynamic / contemporaneous as-is","Time slice using the updates as they were"],
   ["3.4","Observational / dynamic / contemporaneous split","Time slice with the updates corrected/split"],
   ["3.5","Observational / dynamic / modified or recreated","Time slice on reconstructed updates"],
   ["3.6","Modelled / additive / single base","Impacted as-planned"],
   ["3.7","Modelled / additive / multiple base","Time impact analysis"],
   ["3.8","Modelled / subtractive / single base","Collapsed as-built, single"],
   ["3.9","Modelled / subtractive / multiple base","Collapsed as-built, windowed"]
  ]]},
  {tip:["The mapping worth memorising","Impacted as-planned = <b>MIP 3.6</b>. Time impact analysis = <b>MIP 3.7</b>. The difference between them in the taxonomy is exactly <i>single base</i> versus <i>multiple base</i> — which is the same point as the table above: one fixed baseline, or a series of updated programmes. Saying that in an interview demonstrates you understand the taxonomy rather than having memorised a list."]},

  {h:"Windows analysis, worked"},
  {p:"Time slice and as-planned versus as-built are both <b>windows</b> methods, and windows are where most real analyses actually live. The idea is simple and the discipline is everything: divide the project into consecutive periods, establish the driving path <i>within each period</i>, and attribute the slip that occurred in that period to whatever was driving it at the time."},
  {ig:"windows"},
  {p:"Take an 18-month substation split into four windows. In each window the critical path is established from the programme as it stood at the start of that window — not from the baseline, and not from hindsight."},
  {tbl:[["Window","Driving path in that window","Slip","Attributable to"],[
   ["W1  M1–M4","Site access → earthworks → foundations","41 d","Employer — late land handover (DE-01)"],
   ["W2  M5–M9","GIS procurement → manufacture → FAT","40 d","Contractor — subcontractor mobilisation"],
   ["W3  M10–M14","33kV feeder bays (new scope) → cable → term.","55 d","Employer — variation (DE-04)"],
   ["W4  M15–M18","Protection panel wiring → pre-comm → energise","34 d","Contractor — rework after failed QA"]
  ]]},
  {p:"Notice what this exposes that a single whole-project analysis cannot. <b>The critical path is a different chain in every window.</b> In W1 it runs through civils; by W3 it runs through scope that did not exist at baseline. Any method that inserts all four events into the original baseline would attribute all of them to the civils chain, because that is what the baseline said was critical — and it would be wrong three times out of four."},
  {p:"Totals: 170 days of slip, of which 96 days sit against the employer and 74 against the contractor. The contractor's entitlement is <b>96 days of extension of time</b>, not the net 22 days that a set-off instinct suggests, and not the full 170. Entitlement is assessed event by event, then aggregated — never netted."},
  {warn:["The netting error","'You caused 74 days and we caused 96, so you get 22 days.' This is wrong and it is argued constantly. Extension of time relieves the contractor of liquidated damages for periods the employer caused. Contractor-caused delay does not cancel employer-caused delay; it simply earns no relief of its own. The two are assessed separately and the contractor's own 74 days remain its own risk — they show up as the portion of the total lateness for which liquidated damages still bite."]},
  {ok:["What makes a windows analysis survive cross-examination","Windows chosen for a defensible reason — update dates, major events, or contract periods — and not gerrymandered to place convenient events inside convenient windows. The driving path stated and evidenced for each window. Contractor delay conceded openly where it exists. And the same window boundaries used consistently for both parties' events."]},
  {w:"windows"},

  {h:"How to choose a method"},
  {p:"Choice is driven by four factors, in this order."},
  {ol:[
   "<b>What the contract says.</b> If it mandates a method, that is the end of the discussion.",
   "<b>What records exist.</b> No reliable updates rules out time slice and TIA. No as-built logic rules out collapsed as-built. Records determine feasibility before preference does.",
   "<b>When the analysis is being done.</b> During the project, prospective methods are appropriate and contemporaneous. Years later, retrospective methods using actual outcomes are more persuasive.",
   "<b>The value at stake.</b> A windows analysis on an 18-month project is weeks of expert time. It has to be proportionate to the sum in dispute."
  ]},
  {warn:["The answer that fails an interview","'Time impact analysis, because it is the industry standard.' TIA is prospective and additive, and requires good contemporaneous updates. If the project has no reliable updates, TIA cannot be performed honestly — and an analyst who reconstructs the updates in order to run it has produced MIP 3.5 territory while calling it something else. The right answer always begins with what records exist."]},
  {say:["A delay expert, arbitration practice","I decide the method after I have seen the document schedule, not before. Half the methods in the Protocol are unavailable on most projects, and the other half give different answers. The choice is the opinion."]}
 ],
 check:{type:"mcq",
  q:"A dispute arises three years after completion. The contractor kept a properly accepted baseline and monthly P6 updates throughout, but never recorded as-built logic. The contract does not mandate a method. Which is the most defensible primary analysis?",
  opts:[
   "Collapsed as-built, because it demonstrates but-for causation most directly",
   "Impacted as-planned, because the baseline is accepted and it is quickest",
   "Time slice windows analysis, using the contemporaneous monthly updates to track how the critical path actually moved",
   "Retrospective longest path, because the analysis is being done after completion"
  ],
  a:2,
  hint:"Start with the records. Which methods are simply unavailable here, and which one is made possible by the thing this contractor actually did keep?",
  why:"Reliable contemporaneous monthly updates are exactly the record set that time slice windows analysis (SCL method 3, AACE MIP 3.3) requires, and it is a strong retrospective method for an analysis performed after completion. Collapsed as-built (a) requires as-built logic, which was never recorded — inferring it three years later invites attack on the central assumption. Impacted as-planned (b) is quick and widely rejected because it ignores the as-built entirely; the existence of good updates makes choosing it indefensible. Retrospective longest path (d) is possible but discards the contemporaneous record in favour of pure hindsight, when that record is this contractor's strongest asset."}
},

{id:"L19", lvl:4, t:"Concurrency and entitlement",
 sub:"The three delay categories, true versus sequential concurrency, the competing approaches, and why EOT is not prolongation",
 body:[
  {p:"Concurrency is where delay analysis stops being arithmetic and becomes argument. It is the most contested topic in construction dispute practice, and the position you should take is that it is genuinely unsettled — anyone who tells you there is one right answer is describing one jurisdiction's preference."},

  {h:"The three categories of delay"},
  {ig:"entitlement"},
  {tbl:[["Category","Caused by","Time?","Money?","Examples"],[
   ["<b>Excusable and compensable</b>","The employer","<b>Yes</b>","<b>Yes</b>","Late access, late free-issue equipment, late approvals, variations, employer-instructed suspension"],
   ["<b>Excusable, non-compensable</b>","Neither party — neutral events","<b>Yes</b>","<b>No</b>","Exceptionally adverse weather, force majeure, some statutory changes"],
   ["<b>Non-excusable</b>","The contractor","<b>No</b>","<b>No</b>","Poor productivity, subcontractor failure, insufficient resource, rework, own procurement delay"]
  ]]},
  {p:"The middle row is the one people forget. Neutral events earn <b>time but not money</b> — the contractor is relieved of liquidated damages but bears its own prolongation cost. This is the standard risk allocation under FIDIC and it is also, as we are about to see, the usual outcome of genuine concurrency."},

  {h:"What concurrency actually means"},
  {def:["Concurrent delay","Two or more delay events, for which different parties are responsible, that are effective at the same time and each of which would independently have caused delay to completion."]},
  {p:"Every part of that definition is doing work. Both events must be <b>effective</b> — actually causing delay, not merely occurring. Both must affect the <b>critical path</b>. They must <b>overlap in time</b>. And each must be <b>independently capable</b> of causing the delay on its own. Fail any one of the four and it is not concurrency."},
  {ig:"concurrency"},

  {h:"True concurrency versus sequential concurrency"},
  {p:"<b>True concurrency</b> is where two delay events begin at the same time and run together. It is rare — genuinely simultaneous onset is uncommon on real projects."},
  {p:"<b>Sequential concurrency</b>, sometimes called concurrent effect, is where the events start at different times but their <i>effects</i> overlap. The employer's delay runs from 1 May to 30 June; the contractor's delay runs from 1 June to 31 July. The overlap of 1–30 June is where the concurrency argument lives. This is the common case, and most disputes about 'concurrency' are really disputes about whether an overlap of effect counts."},
  {warn:["The most frequent error made by contractors","Claiming concurrency for an employer delay that hits an activity with 20 days of float. If the activity was not driving completion, the employer's event caused no delay to completion at all — so there is nothing to be concurrent with. Concurrency requires <b>both</b> events to be critical. Contractors routinely assert concurrency when what they actually have is one critical contractor delay and one non-critical employer event, which entitles them to nothing."]},

  {h:"The three competing approaches"},
  {tbl:[["Approach","Rule","Where it is favoured"],[
   ["<b>Dominant cause</b>","Identify which cause was the effective, dominant one and allocate the whole delay to it","Attractive in principle; hard in practice — genuine concurrency means no cause dominates"],
   ["<b>Apportionment</b>","Divide responsibility between the parties on a fair basis","Scots law — <i>City Inn v Shepherd Construction</i>. Rejected in England"],
   ["<b>Contractual allocation</b>","Apply whatever the contract says, including express concurrency clauses","Increasingly common. Many bespoke forms now state that concurrency yields time but no money"]
  ]]},
  {p:"The mainstream English position derives from the <i>Malmaison</i> approach: where a contractor delay runs concurrently with an employer delay that is a stated ground for extension of time, the contractor is <b>entitled to the extension of time</b> — but generally recovers <b>no prolongation cost</b>, because it would have incurred that cost anyway as a result of its own delay."},
  {ok:["The answer to give when asked","Under genuine concurrency the usual outcome is <b>time but not money</b>. The contractor gets relief from liquidated damages, because the employer cannot levy damages for a period it also caused. The contractor does not recover prolongation costs, because it cannot show that the employer's event caused it to incur costs it would have avoided. Say 'usual', not 'always' — the contract may allocate it differently, and Scots law may apportion."]},

  {h:"Extension of time is not prolongation cost"},
  {p:"These are two separate claims requiring two separate proofs, and conflating them is a mark of inexperience."},
  {tbl:[["","Extension of time","Prolongation cost"],[
   ["What it gives","Relief from liquidated damages; a later completion date","Payment for time-related costs over the extended period"],
   ["What must be proved","That a qualifying event delayed <b>completion</b>","That cost was <b>actually incurred</b> as a result of that event"],
   ["Basis of valuation","Days on the critical path","Actual records — site establishment, staff, plant, insurances, bonds"],
   ["Concurrency effect","Generally survives concurrency","Generally defeated by concurrency"]
  ]]},
  {warn:["Prolongation is not a formula","Prolongation cost is proved by actual cost records for the period of delay — not by taking the contract preliminaries, dividing by the contract duration, and multiplying by the days awarded. That calculation is intuitive, common, and routinely rejected, because it assumes a uniform spend rate that no project ever has. The costs must be the costs actually incurred during the delay period, evidenced."]},

  {h:"Building the entitlement position"},
  {p:"Entitlement is assembled event by event and then aggregated. The tool below takes a five-event register and computes the three numbers that matter — days of extension of time, days that carry money, and the residual lateness on which liquidated damages still bite. Move the concurrency overlap and watch time and money separate."},
  {w:"eot"},

  {h:"The four tests to apply"},
  {p:"When you are handed two overlapping events and asked whether they are concurrent, work through these in order. If any answer is no, the concurrency argument fails."},
  {ol:[
   "<b>Are both events on the critical path?</b> If one has float, it is not causing delay to completion.",
   "<b>Do they overlap in effect?</b> Not merely in occurrence — is there a period in which both are delaying completion?",
   "<b>Is each independently capable of causing the delay?</b> If removing one leaves the delay unchanged, that one is the effective cause and the other is not concurrent.",
   "<b>What does the contract say?</b> An express concurrency provision overrides the general law and is the first thing to check, not the last."
  ]},
  {say:["A delay expert","Most alleged concurrency dissolves under test one. The contractor's delay is critical and the employer's event is on a chain with eleven days of float. There is no concurrency — there is one delay and one grievance."]}
 ],
 check:{type:"mcq",
  q:"From 1 to 30 September, the employer failed to give access to the switchyard (critical, 30 days of delay) while the contractor's own steel subcontractor was simultaneously 30 days late on critical erection works. The contract is silent on concurrency and English-law principles apply. What is the most likely outcome?",
  opts:[
   "30 days extension of time and 30 days of prolongation cost",
   "30 days extension of time, but no prolongation cost",
   "No extension of time, because the contractor was in delay anyway",
   "15 days extension of time and 50% of prolongation cost, by apportionment"
  ],
  a:1,
  hint:"Separate the two claims. Ask what each one requires the contractor to prove, then ask which of those proofs survives the fact that the contractor would have been 30 days late regardless.",
  why:"This is genuine concurrency: two critical, overlapping, independently sufficient causes. Under the mainstream English approach the contractor gets the 30-day extension of time — the employer cannot levy liquidated damages for a period it caused — but recovers no prolongation cost, because it would have incurred those costs anyway due to its own subcontractor's delay. Option (c) is the employer's argument and fails because it ignores the employer's own critical delay. Option (d) is the Scots apportionment approach from City Inn, which was not followed in England. Option (a) gives the contractor a windfall it cannot prove causation for."}
},

{id:"L20", lvl:4, t:"Disruption and the measured mile",
 sub:"Delay versus disruption, AACE RP 25R-03, the six methods ranked, and why records decide it at project start",
 body:[
  {p:"Disruption is the loss that does not appear on a Gantt chart. A project can finish exactly on time and still have lost several million dirhams to disrupted labour — and because there is no late milestone to point at, disruption claims are harder to prove and far more often lost than delay claims."},

  {h:"Delay versus disruption"},
  {tbl:[["","Delay","Disruption"],[
   ["What is lost","<b>Time</b> — activities and completion pushed later","<b>Productivity</b> — the same work takes more man-hours"],
   ["Evidence","Programme, critical path, updates","Man-hour records, quantity records, productivity data"],
   ["Claimed as","Extension of time + prolongation cost","Loss of productivity / lost labour efficiency"],
   ["Can occur without the other","Yes","<b>Yes</b> — a project can finish on time and still be heavily disrupted"]
  ]]},
  {p:"That last row is the key concept. Out-of-sequence working, trade stacking, excessive overtime and repeated re-mobilisation all consume man-hours without necessarily moving the completion date — particularly where the contractor absorbed the impact by adding resource. The contractor finished on time <i>because</i> it spent the money, and the claim is for that money."},

  {h:"What actually causes disruption"},
  {ul:[
   "<b>Trade stacking</b> — more crews in a work area than it can accommodate, so everyone slows down",
   "<b>Out-of-sequence working</b> — building in an order the method statement never contemplated",
   "<b>Excessive overtime</b> — sustained long hours produce well-documented efficiency decay through fatigue",
   "<b>Crew size changes and dilution</b> — rapid ramp-up brings less experienced labour and supervision ratios fall",
   "<b>Re-mobilisation</b> — the learning curve is paid again every time a crew leaves and returns",
   "<b>Rework and late design change</b> — work done twice, and the second time in worse conditions"
  ]},

  {h:"AACE RP 25R-03"},
  {p:"AACE International Recommended Practice 25R-03, <i>Estimating Lost Labor Productivity in Construction Claims</i>, is the standard reference. It ranks methods by evidential reliability, and the ranking is the practically useful part."},
  {ig:"disruption"},
  {tbl:[["Rank","Method","Basis","Reliability"],[
   ["<b>1</b>","<b>Measured mile</b>","Compare an undisrupted period of the <i>same work</i> on the <i>same project</i> against the disrupted period","<b>Highest.</b> The preferred method by a clear margin"],
   ["2","Earned value / baseline comparison","Planned versus achieved productivity from the project's own data","High, where the baseline productivity was realistic"],
   ["3","Comparable work / project studies","Similar scope elsewhere on the project or on another project","Moderate — comparability is always attacked"],
   ["4","Industry studies and factors","Published curves (e.g. overtime and stacking factors)","Lower — generic, not project-specific"],
   ["5","Cost-based / total cost","Actual cost minus tender allowance","<b>Low.</b> Assumes the tender was correct and all overrun was the employer's fault"],
   ["6","Modified total cost","Total cost adjusted for contractor-caused elements","Low, but better than pure total cost"]
  ]]},
  {warn:["Why total cost claims usually fail","A total cost claim asserts that the difference between tendered cost and actual cost is the employer's responsibility. It requires the tribunal to accept that the tender was accurate, that the contractor was not itself inefficient, and that no other cause contributed. Tribunals rarely accept all three. It is the method of last resort, and pleading it first signals that the records to do better do not exist."]},

  {h:"The measured mile"},
  {def:["Measured mile","A comparison of labour productivity achieved during a demonstrably undisrupted period of work against productivity on the same or substantially similar work during the disrupted period, on the same project."]},
  {p:"Its power is that it uses the contractor's own performance as the benchmark, which removes the two arguments that destroy other methods: that the tender was optimistic, and that the contractor is simply inefficient. If the same crews on the same project achieved 1.8 man-hours per metre in the clean period, that is the demonstrated capability."},
  {fx:"Cable pulling, 33kV — same crews, same project\n\nUndisrupted period (weeks 12–20):\n  Quantity  = 8,400 m      Man-hours = 15,120\n  Rate      = 15,120 ÷ 8,400 = <b>1.80 mh/m</b>\n\nDisrupted period (weeks 21–34), trade stacking + out-of-sequence:\n  Quantity  = 11,600 m     Man-hours = 33,930\n  Rate      = 33,930 ÷ 11,600 = <b>2.925 mh/m</b>\n\nProductivity loss   = 2.925 − 1.80 = 1.125 mh/m\nLost man-hours      = 1.125 × 11,600 = <b>13,050 man-hours</b>\nAt AED 95/mh        = <b>AED 1,239,750</b>"},
  {ok:["What makes a measured mile survive challenge","The comparison period must be genuinely undisrupted — not merely less disrupted. It must involve substantially similar work, similar crews and similar conditions. It should be long enough to be representative rather than a favourable fortnight. And the disrupted period must be linked to identified employer-responsible causes, because demonstrating a productivity drop is only half the claim; the other half is causation."]},
  {p:"Where no clean period exists on the project at all — because disruption began at mobilisation — the fallback is a comparable-work study from another project, which is method 3 and materially weaker. This is a strong argument for protecting an early clean baseline period in the records deliberately."},

  {h:"Records decide this at project start"},
  {p:"This is the sentence that matters most in the lesson. <b>Disruption claims are won or lost by the record-keeping system established in the first month of the project</b>, long before anyone suspects there will be a claim. A contractor who begins collecting the right data at month 20, when the losses have become obvious, has already lost the ability to prove the measured mile — because there is no early clean-period data to compare against."},
  {p:"The minimum record set, collected weekly from day one:"},
  {ul:[
   "<b>Man-hours by activity and by area</b> — not by cost code alone. The area dimension is what proves trade stacking",
   "<b>Quantities installed</b> by the same breakdown, so a productivity rate can be computed for any period",
   "<b>Daily labour allocation sheets</b> — crew, location, task, hours, signed",
   "<b>Site diaries and photographs</b> — dated, with location, showing conditions and congestion",
   "<b>Constraint and instruction logs</b> — what stopped work, when, on whose instruction",
   "<b>Weather records</b> where relevant, from a defensible source"
  ]},
  {tip:["The question to ask in month one","'If we had to prove a productivity loss in this area eighteen months from now, what would we point at?' If the answer is a monthly cost report, the system is inadequate. It takes about one hour a week per area to fix, and it is the highest-value hour in the project controls function."]},
  {say:["A quantum expert","I have never rejected a disruption claim because the disruption did not happen. I reject them because the contractor cannot show me what good looked like on their own project."]}
 ],
 check:{type:"calc",
  q:"Formwork erection. Undisrupted period: 4,200 m² using 10,080 man-hours. Disrupted period: 6,500 m² using 22,750 man-hours. <b>How many man-hours were lost to disruption?</b> Give a whole number.",
  a:7150, tol:5, unit:"man-hours",
  hint:"Compute the man-hours per m² in each period. The loss is the difference in rate, applied to the disrupted quantity only.",
  why:"Undisrupted rate = 10,080 ÷ 4,200 = 2.40 mh/m². Disrupted rate = 22,750 ÷ 6,500 = 3.50 mh/m². Loss per unit = 3.50 − 2.40 = 1.10 mh/m². Applied to the disrupted quantity: 1.10 × 6,500 = 7,150 man-hours. Note it is applied to the disrupted quantity, not the total quantity — you are claiming the excess on the work that was actually disrupted. A common error is to apply the differential to all 10,700 m², which would overstate the claim by 4,620 man-hours and hand the opposing expert an easy attack on the whole calculation."}
},

{id:"L21", lvl:4, t:"Assembling the extension of time claim",
 sub:"The ten-part structure, what actually wins ranked, the delay register and prolongation cost",
 body:[
  {p:"A claim is a persuasive document built on evidence, not a schedule with an invoice attached. The technical analysis is necessary and it is not sufficient — the majority of claims that fail do so on notice, causation or records rather than on the delay analysis being wrong."},

  {h:"The ten-part structure"},
  {ig:"claim10"},
  {ol:[
   "<b>Executive summary</b> — the entitlement, the days, the money, in one page. Assume most readers read only this.",
   "<b>Contractual basis</b> — the specific clauses relied on, quoted, with the notice history that satisfies each condition precedent.",
   "<b>The project and the baseline</b> — what was contracted, what programme was accepted, when.",
   "<b>Narrative of events</b> — chronological, factual, each statement referenced to a document.",
   "<b>The delay events</b> — each one described separately: what happened, when, who was responsible, which clause it engages.",
   "<b>Delay analysis</b> — method stated and justified, base programmes identified, fragnets shown, results per event.",
   "<b>Concurrency</b> — addressed openly, including contractor-caused delay. Do not wait to be asked.",
   "<b>Quantum</b> — prolongation cost from actual records, disruption if claimed, each head separately evidenced.",
   "<b>Mitigation</b> — what the contractor did to reduce the impact. Most contracts require reasonable endeavours and tribunals look for it.",
   "<b>Appendices</b> — notices, correspondence, programmes, site records, photographs, indexed and cross-referenced."
  ]},
  {ok:["Address concurrency yourself","A claim that ignores obvious contractor-caused delay reads as either dishonest or incompetent, and the response will lead with it. Dealing with it openly — 'the contractor accepts 14 days of its own delay in this window and claims 22 days net' — makes the entire document more credible, and the assessor will treat the rest of it more generously."]},

  {h:"What actually wins, ranked"},
  {p:"Ranked by how often each factor decides the outcome in practice."},
  {tbl:[["Rank","Factor","Why it decides cases"],[
   ["<b>1</b>","<b>Valid, timely notice</b>","Condition precedent. Fails first and fails absolutely. No amount of merit survives it"],
   ["<b>2</b>","<b>Contemporaneous records</b>","Site diaries, labour returns, photographs, correspondence made at the time. Reconstruction is transparent and carries far less weight"],
   ["<b>3</b>","<b>Demonstrated causation</b>","Not that the event happened, but that it caused critical delay to <i>completion</i>"],
   ["<b>4</b>","<b>Accepted baseline</b>","Without an agreed measuring stick, every comparison is arguable"],
   ["<b>5</b>","<b>Credible, justified analysis method</b>","Appropriate to the records, applied consistently, honestly explained"],
   ["<b>6</b>","<b>Substantiated quantum</b>","Actual costs from the accounts, not a formula applied to preliminaries"],
   ["<b>7</b>","<b>Clarity of presentation</b>","An assessor who cannot follow it will not award it"]
  ]]},
  {warn:["Note what is not at the top","The sophistication of the delay analysis is fifth. Contractors routinely spend heavily on expert analysis for claims that were extinguished by a missed notice in month four. The cheap, unglamorous items — notices and records — decide more cases than every analytical technique in Lesson 18 combined."]},

  {h:"The delay register, again"},
  {p:"It has appeared in three lessons because it is the instrument that makes everything above possible. Each row is a claim in embryo."},
  {tbl:[["Field","Example"],[
   ["Event ref","DE-014"],
   ["Date of awareness","03-Mar-2025"],
   ["Description","Free-issue 220kV transformer T2 delivery advised late by employer"],
   ["Cause / responsible party","Employer — free-issue equipment"],
   ["Contract clause","Sub-Clause 8.4(b) / 20.1 notice"],
   ["Notice issued","LTR-0221, 14-Mar-2025 (11 days)"],
   ["Activities affected","A-4410 T2 Install, A-4460 T2 Testing"],
   ["Critical?","Yes — driving path to energisation"],
   ["Days impact (assessed)","38 days"],
   ["Status","Notified; particulars submitted 21-Apr-2025; under assessment"]
  ]]},
  {p:"Kept properly, this register produces the notice log, the chronology, the event list for the analysis and the appendix index — four claim components as a by-product of ten minutes a week."},

  {h:"Prolongation cost"},
  {p:"The costs of being on site longer. Claimed for the <b>period of the delay</b>, evidenced from actual records."},
  {ul:[
   "<b>Time-related site overheads</b> — site management and supervision staff, site accommodation, welfare, utilities, security, IT, transport",
   "<b>Plant and equipment</b> held on site over the extended period, at actual cost or defensible internal rates",
   "<b>Bonds, guarantees and insurances</b> extended over the additional period",
   "<b>Head office overhead and profit</b> — the most contested head. Formulae such as Hudson, Emden and Eichleay exist but are viewed with suspicion; actual evidence of lost opportunity is far stronger where it can be produced"
  ]},
  {warn:["The two errors that recur","First, claiming prolongation for the wrong period — costs must be those incurred during the <b>delay window</b>, which is usually a mid-project period, not the tail end after the original completion date. The rates differ substantially between the two. Second, using contract preliminaries divided by contract duration as a daily rate. It is intuitive, it is quick, and it is rejected, because no project spends preliminaries uniformly."]},

  {h:"A closing position"},
  {p:"You now have the full chain: scope becomes a WBS, the WBS becomes activities, activities become a network, the network produces dates and float, the baseline freezes it, weightage measures it, earned value and earned schedule diagnose it, risk analysis bounds it, the contract gives it commercial meaning, and delay analysis proves what happened when it went wrong."},
  {p:"The thread running through all of it is honesty made auditable. A programme that cannot report bad news, progress that cannot be verified, a forecast nobody believes, a claim without records — each is the same failure appearing at a different stage. The discipline is not about producing documents. It is about producing numbers somebody can act on and defend."},
  {say:["A head of project controls","The best planner on any project is the one whose bad news arrives earliest. Everything else in the job is technique."]}
 ],
 check:{type:"mcq",
  q:"A contractor has an unanswerable technical case: 62 days of critical delay caused entirely by late employer approvals, proved by a properly conducted time slice analysis on accepted updates. Notice was given 51 days after the contractor became aware, under a FIDIC 1999 contract with unamended Sub-Clause 20.1. What is the likely outcome?",
  opts: [
   "Full entitlement — 62 days EOT and prolongation cost, because causation is clearly proved",
   "The claim is likely time-barred; the strength of the analysis does not cure a late notice under a condition precedent",
   "Entitlement reduced proportionately to reflect the 23 days of lateness in notifying",
   "Time only, no money, because late notice removes the cost element but not the time"
  ],
  a:1,
  hint:"Rank the factors that decide claims. Where does the quality of the delay analysis sit, and what sits above it?",
  why:"Standard unamended FIDIC 1999 Sub-Clause 20.1 makes the 28-day notice a condition precedent, expressly providing that on failure the time shall not be extended and the contractor shall not be entitled to additional payment. Notice at 51 days is 23 days out of time and the entitlement is extinguished regardless of merit. There is no proportionate reduction mechanism (c) and no time-but-not-money split (d) — the clause defeats both heads together. This is the ranking from this lesson in its harshest form: notice is first, analysis is fifth, and a perfect fifth cannot rescue a failed first. Some jurisdictions will scrutinise time bars and prevention-principle arguments occasionally succeed, but no competent planner relies on that."}
}
];

/* ========================================================================== *
 *  GLOSSARY — 58 terms, alphabetised at render time
 * ========================================================================== */
var GLOSSARY = [
 ["AACE RP 25R-03","Disruption","AACE International Recommended Practice for estimating lost labour productivity in construction claims. Ranks methods by reliability, with the measured mile first and total-cost approaches last."],
 ["AACE RP 29R-03","Forensic","AACE International Recommended Practice for Forensic Schedule Analysis. Classifies methods as observational or modelled, static or dynamic, additive or subtractive, single or multiple base, giving nine Method Implementation Protocols."],
 ["Activity","Scheduling","A discrete element of work with a duration, position in the network, and normally a resource and cost. The lowest level at which the schedule calculates."],
 ["Actual Cost (AC)","EVM","The cost actually incurred for work performed to the data date. Also ACWP — actual cost of work performed."],
 ["Apportionment","Forensic","Dividing responsibility for concurrent delay between the parties on a fair basis. Followed in Scots law (City Inn) and rejected in England."],
 ["As-built programme","Forensic","A record of what actually happened — actual start and finish dates for all activities. The evidential basis for retrospective delay analysis."],
 ["Backward pass","CPM","The calculation from the end of the network to the start that produces late start and late finish dates. LF of a predecessor is the minimum LS of its successors."],
 ["Baseline","Control","The approved, frozen version of the schedule, cost and scope against which performance is measured. Changed only for approved variations, granted EOTs or agreed errors."],
 ["Baseline Execution Index (BEI)","DCMA","Tasks actually completed divided by tasks the baseline required to be complete by the data date. DCMA test 14; threshold 0.95."],
 ["Budget at Completion (BAC)","EVM","The total authorised budget for the work. The end point of the planned value curve."],
 ["Concurrent delay","Forensic","Two or more delay events for which different parties are responsible, effective at the same time, each independently capable of causing delay to completion."],
 ["Constraint","Scheduling","A date imposed on an activity that overrides logic. Hard or mandatory constraints stop the network calculating and are capped at 5% by DCMA test 5."],
 ["Contingency","Risk","Time or cost reserve held to cover identified risk. Should be held centrally and released deliberately, never distributed into activity durations."],
 ["Control account","WBS","The intersection of a WBS element and an OBS element — a defined package of scope with a named owner, where scope, budget and schedule are integrated and earned value is measured."],
 ["Cost Breakdown Structure (CBS)","WBS","The classification of project cost by type — labour, material, subcontract, plant. Answers how the money is categorised, where the WBS answers what is delivered."],
 ["Cost Performance Index (CPI)","EVM","EV ÷ AC. Cost efficiency. Above 1.00 is good — more budgeted work delivered than money spent."],
 ["Cost Variance (CV)","EVM","EV − AC, in currency. Negative means overspent."],
 ["Crashing","Recovery","Shortening critical activity durations by adding resource and accepting the cost. Logic is unchanged. Buy the cheapest critical days first."],
 ["Criticality index","Risk","The percentage of Monte Carlo iterations in which an activity appears on the critical path. Reveals risk that deterministic float values conceal."],
 ["Critical path","CPM","The longest continuous path through the network, determining project duration. In an unconstrained schedule it equals the chain of zero total float."],
 ["Critical Path Length Index (CPLI)","DCMA","(Critical path length + total float) ÷ critical path length. DCMA test 13; threshold 0.95. Below 1.00 means the path is late against the target."],
 ["Data date","Updating","The boundary between actual and forecast. No remaining work may sit to its left and no actual dates to its right."],
 ["DCMA 14-point","Quality","A mechanical schedule health assessment of fourteen tests with defined thresholds, used as a screening standard on major projects. Passing it does not make a schedule good."],
 ["Delay register","Claims","A contemporaneous log of delay events with cause, responsible party, activities affected, notice reference and assessed impact. The single highest-return record on a project."],
 ["Disruption","Claims","Loss of productivity — the same work consuming more man-hours. Can occur with no delay to completion at all, and is proved by man-hour and quantity records rather than by the programme."],
 ["Driving resource","Resources","A resource whose quantity and availability determine the activity's duration, so that changing the assignment recalculates the duration."],
 ["Duration percent complete","Progress","Progress derived by the software from elapsed time against the data date. Measures the calendar, not the work. Appropriate only for level of effort."],
 ["Earned Schedule (ES)","EVM","The point in time at which the baseline planned to have earned the value achieved today. Converts schedule performance from currency into time."],
 ["Earned Value (EV)","EVM","The budgeted cost of work performed — work done, valued at budget, never at spend. Also BCWP."],
 ["Estimate at Completion (EAC)","EVM","Forecast total cost at completion. The standard form assuming past performance continues is BAC ÷ CPI."],
 ["Estimate to Complete (ETC)","EVM","EAC − AC. The forecast remaining spend."],
 ["Excusable delay","Claims","Delay entitling the contractor to an extension of time. Compensable if caused by the employer; non-compensable if caused by a neutral event such as exceptional weather."],
 ["Fast-tracking","Recovery","Overlapping activities planned in sequence. Changes logic rather than resources — free in cash but paid for in rework risk."],
 ["FIDIC","Contract","International Federation of Consulting Engineers. Red Book: construction, employer design. Yellow Book: plant and design-build, contractor design. Silver Book: EPC turnkey, contractor takes most risk."],
 ["Float, free (FF)","CPM","Delay available to an activity without delaying the early start of any successor. Minimum successor ES minus this activity's EF."],
 ["Float, total (TF)","CPM","Delay available without delaying project completion. LS − ES, or equivalently LF − EF. Shared along a chain, not owned per activity."],
 ["Forward pass","CPM","The calculation from the start of the network forward that produces early start and early finish. ES of a successor is the maximum EF of its predecessors."],
 ["Fragnet","Forensic","A small sub-network modelling a delay event, inserted into a base programme to measure its impact. The core device of time impact analysis."],
 ["Impacted As-Planned","Forensic","Inserting delay events into the original unmodified baseline. AACE MIP 3.6. Simple, ignores as-built reality, and frequently rejected."],
 ["Lag","Logic","A mandatory waiting period on a relationship, representing real elapsed time such as curing or a notice period. Capped at 5% of relationships by DCMA test 3."],
 ["Lead","Logic","A negative lag allowing a successor to start before its predecessor finishes. Prohibited — DCMA test 2 requires zero — because it breaks the backward pass and produces indefensible float."],
 ["Level of Effort (LOE)","Progress","Support work with no discrete deliverable, earning value purely by the passage of time. Must be kept small and isolated or it inflates reported progress."],
 ["Levelling, resource","Resources","Rescheduling to respect a resource limit, allowing the completion date to move. Smoothing is the same exercise constrained to available float only."],
 ["Longest path","CPM","P6's critical-path definition based on the actual driving chain rather than on total float. Preferred where constraints or multiple calendars distort float values."],
 ["Measured mile","Disruption","Comparing productivity in a demonstrably undisrupted period against the disrupted period on the same project and work. The most reliable disruption method."],
 ["Monte Carlo simulation","Risk","Running the network thousands of times sampling durations from distributions, producing a probability distribution of completion dates and revealing merge bias."],
 ["Negative float","CPM","Total float below zero — the network reporting that an imposed date is earlier than the logic allows. Information, not necessarily a defect."],
 ["Open end","Logic","An activity missing a predecessor or a successor. A dangling finish is the more dangerous case because it removes work from the critical path calculation."],
 ["Organisational Breakdown Structure (OBS)","WBS","The hierarchy of accountability. Crossed with the WBS it defines control accounts."],
 ["PERT","Risk","Program Evaluation and Review Technique. As a technique it means three-point estimating: te = (O + 4M + P) ÷ 6, SD = (P − O) ÷ 6. A PERT chart is a network diagram — a different thing sharing the name."],
 ["Physical percent complete","Progress","Progress entered against a rule of credit. Measures the work. In P6 it does not auto-calculate actual units, and it does not move the forecast finish date — only remaining duration does that."],
 ["Planned Value (PV)","EVM","The budgeted cost of work scheduled to the data date. Also BCWS. The baseline S-curve."],
 ["Prevention principle","Contract","An employer cannot enforce a completion date it has itself prevented the contractor from meeting. Where no effective EOT mechanism applies, time may become at large."],
 ["Progress override","Updating","A scheduling option that ignores logic for activities already started out of sequence, generally producing an earlier finish. Contrast retained logic."],
 ["Prolongation cost","Claims","Time-related cost of remaining on site over the delay period, proved from actual records for that period — not by dividing contract preliminaries by contract duration."],
 ["Retained logic","Updating","A scheduling option preserving original relationships for out-of-sequence work, generally producing a later finish. The safer default for contractual programmes."],
 ["Rule of credit","Progress","A pre-agreed table of binary, inspectable milestones with assigned percentages, used to measure partial progress without opinion."],
 ["S-curve","Reporting","Cumulative progress or cost against time. S-shaped because projects start slowly, accelerate through construction and flatten into testing. The periodic peak sits mid-project, never at handover."],
 ["Schedule Performance Index (SPI)","EVM","EV ÷ PV. Above 1.00 is good. Converges to 1.00 as a project approaches completion regardless of lateness, which is why Earned Schedule exists."],
 ["Schedule Variance (SV)","EVM","EV − PV, expressed in currency rather than time. Negative means behind."],
 ["SCL Protocol","Forensic","The Society of Construction Law Delay and Disruption Protocol, 2nd edition 2017. Identifies six delay analysis methods and is the standard industry vocabulary."],
 ["SPI(t)","EVM","ES ÷ AT — the Earned Schedule performance index, measured in time. Unlike SPI it does not converge to 1.00 on a late project."],
 ["TCPI","EVM","To Complete Performance Index — the cost efficiency required on all remaining work to hit a target. (BAC − EV) ÷ (BAC − AC) for the original budget."],
 ["Time at large","Contract","The state in which no fixed completion date binds the contractor, who must complete within a reasonable time. Liquidated damages become unenforceable."],
 ["Time Impact Analysis (TIA)","Forensic","Inserting a delay fragnet into the programme updated to immediately before the event, event by event in chronological order. AACE MIP 3.7."],
 ["Variance at Completion (VAC)","EVM","BAC − EAC. Negative forecasts an overrun."],
 ["Weightage","Progress","Each activity's share of the total, used to roll partial progress into a project figure. Multiplied by BAC it is earned value — the same idea in different units."],
 ["Work Breakdown Structure (WBS)","WBS","Deliverable-oriented hierarchical decomposition of total scope. Children must sum to exactly 100% of the parent."],
 ["Work package","WBS","The lowest WBS element that is planned, costed and controlled. Commonly sized at 0.5% to 2% of total project value."]
];

/* ========================================================================== *
 *  SPOT-THE-DEFECT BOARDS
 *  Rows carrying a `bad` string are seeded defects. Others are clean.
 * ========================================================================== */
var DEFECTS = [
{id:"DF1", lvl:1, xp:120, title:"Programme extract — civil works",
 intro:"This is a genuine-looking extract from a submitted Level 3 programme. Click every row you believe contains a defect, then submit. Your score is defects found minus false positives, so guessing costs you.",
 cols:["ID","Activity","Dur","Predecessor","Calendar","Constraint","TF","%"],
 rows:[
  {c:["C-1010","Site clearance &amp; grading","15","—","6-day","—","0","100"],
   bad:"Open end. No predecessor other than project start would be acceptable for the very first activity, but this is not the first activity in the programme — it dangles free and can float to day one regardless of access."},
  {c:["C-1020","Excavate transformer foundations","18","C-1010","6-day","—","0","100"]},
  {c:["C-1030","Blinding &amp; formwork T1","10","C-1020","6-day","—","4","100"]},
  {c:["C-1040","Reinforcement fixing T1","12","C-1030 FS-4","6-day","—","4","65"],
   bad:"Lead (negative lag). FS-4 lets reinforcement start four days before formwork finishes. DCMA test 2 requires zero leads. Model the genuine overlap as SS with a lag instead."},
  {c:["C-1050","Concrete pour T1","3","C-1040","6-day","—","4","0"]},
  {c:["C-1060","Concrete curing T1","7","C-1050","6-day","—","4","0"],
   bad:"Curing on a 6-day working calendar. Concrete cures on Fridays and public holidays. A 7-day cure sits on a 7-day continuous calendar, otherwise the programme understates the real elapsed time on every pour in the project."},
  {c:["C-1070","Backfill &amp; compaction T1","8","C-1060","6-day","—","4","0"]},
  {c:["C-2010","Control building substructure","22","C-1010","6-day","—","12","40"]},
  {c:["C-2020","Control building superstructure","95","C-2010","6-day","—","12","0"],
   bad:"Duration of 95 days exceeds the 44-day threshold in DCMA test 8. It cannot be progressed verifiably, it hides internal sequence from the network, and by the time a slip is visible most of the duration is spent."},
  {c:["C-2030","Control building M&amp;E first fix","30","C-2020","6-day","—","12","0"]},
  {c:["C-3010","Cable trench excavation","25","C-1010","6-day","<b>MS On 12-Apr</b>","-8","55"],
   bad:"Mandatory Start constraint. A hard constraint overrides logic entirely, prevents the network from calculating through this activity, and is generating the negative float shown. DCMA test 5 caps hard constraints at 5%; this one is also the likely cause of defect on row C-3020."},
  {c:["C-3020","Cable trench blockwork","20","C-3010","6-day","—","-8","30"],
   bad:"Negative float of −8 days. DCMA test 7 requires zero activities with negative float. Left unexplained across updates it means the programme is reporting a date it cannot achieve and nobody has acted on it."},
  {c:["C-4010","Switchyard earthing grid","28","C-1020","6-day","—","6","99"],
   bad:"99% complete and static for three consecutive reporting periods (see the % column against the update history). A stalled 99% almost always means the activity is functionally blocked but nobody wants to report it, and the remaining 1% is hiding a real constraint."},
  {c:["C-4020","Switchyard gantry erection","20","C-4010","6-day","—","6","0"]},
  {c:["C-5010","Perimeter fencing","30","—","6-day","—","145","0"],
   bad:"Dangling finish — no successor. It cannot delay anything, so it will never appear on the critical path, and its 145 days of total float also breaches DCMA test 6 (high float above 44 days). This is the defect pattern that lets genuine delay disappear from a programme."},
  {c:["C-5020","Site roads &amp; hardstanding","24","C-1010","6-day","—","38","0"]},
  {c:["C-6010","Transformer T1 installation","14","C-1070","6-day","—","4","0"]},
  {c:["C-6020","Transformer T1 oil filtration","6","C-6010","<b>6-day</b>","—","4","0"],
   bad:"Oil filtration on a 6-day working calendar. Like curing, this is a continuous physical process that does not stop for the weekend. It belongs on a 7-day calendar."}
 ]},

{id:"DF2", lvl:2, xp:140, title:"Programme extract — progress and loading review",
 intro:"You are the client's reviewer examining the first monthly update against the accepted baseline. Data date is 30-Nov. Click every row containing a defect.",
 cols:["ID","Activity","Dur","Rem","% Type","%","Actual Start","Resource"],
 rows:[
  {c:["E-1010","P&amp;C philosophy document","20","0","Physical","100","04-Sep","ENG-2"]},
  {c:["E-1020","Single line diagram — IFR","15","0","Physical","100","28-Sep","ENG-2"]},
  {c:["E-1030","Protection setting calculations","25","10","<b>Duration</b>","60","15-Oct","ENG-3"],
   bad:"Duration percent complete on a discrete engineering deliverable. It measures elapsed calendar time, not work done, and requires no honesty from anyone. Physical percent against the engineering 5-step rule of credit is required."},
  {c:["E-1040","Cable schedules","18","18","Physical","0","—","ENG-1"]},
  {c:["P-2010","GIS purchase order","10","0","Physical","100","12-Sep","PRC-1"]},
  {c:["P-2020","GIS vendor drawings approval","30","12","Physical","55","20-Oct","PRC-1"]},
  {c:["P-2030","GIS manufacture &amp; FAT","180","180","Physical","0","—","—"],
   bad:"No resource or cost assignment on an activity with a duration greater than zero, in a resource-loaded programme. DCMA test 10. On an item of this value it also means the S-curve is missing a very large block of value."},
  {c:["P-2040","GIS shipment &amp; delivery","45","45","Physical","0","<b>15-Dec</b>","PRC-2"],
   bad:"Actual start date of 15-Dec is later than the 30-Nov data date. An actual date cannot exist in the future. DCMA test 9 — invalid dates. Almost always caused by typing a planned date into the actual field."},
  {c:["C-3010","Foundation works package","60","<b>36</b>","Physical","20","01-Oct","CIV-4"],
   bad:"Remaining duration is the software's linear default (60 − 24 elapsed = 36) but the activity is only 20% complete after 24 days. At the achieved rate the true remaining duration is about 96 days. Remaining duration is a judgement, and this one has not been made."},
  {c:["C-3020","Structural steel erection","40","40","Physical","0","—","CIV-2"]},
  {c:["C-3030","Site preliminaries &amp; management","<b>420</b>","300","Duration","28","01-Aug","MGT-1"]},
  {c:["I-4010","GIS erection bay Q01","25","25","Physical","0","—","ELE-3"]},
  {c:["I-4020","GIS erection bay Q02","25","25","Physical","0","—","<b>ELE-3, VAL-1</b>"]},
  {c:["I-4030","Busbar installation","30","<b>18</b>","Physical","0","—","ELE-2"],
   bad:"Remaining duration of 18 days against an original duration of 30 days, but the activity has not started — 0% complete, no actual start. Remaining duration cannot be less than original duration on unstarted work. A data-entry or import error that will understate the forecast."},
  {c:["T-5010","Pre-commissioning checks","20","20","Physical","0","—","CMM-2"]},
  {c:["T-5020","220kV HV withstand test","2","2","Physical","0","—","CMM-1"]},
  {c:["T-5030","Energisation &amp; PAC","5","5","Physical","0","—","<b>—</b>"],
   bad:"The final milestone activity carries no resource and, more seriously, appears with no successor logic to the contract completion milestone in the extract's logic column. A completion sequence that does not connect through to the contractual milestone is the classic mechanism for a finish date that will not move."}
 ]}
];

/* ========================================================================== *
 *  SEQUENCE BUILDERS — items listed in CORRECT order; shuffled at runtime
 * ========================================================================== */
var SEQUENCES = [
{id:"SQ1", lvl:2, xp:90, title:"The procurement 8-step curve",
 intro:"Drag the eight procurement milestones into the order they occur, earliest first.",
 items:["Requisition / technical specification issued","Enquiry issued to bidders","Technical bid evaluation complete","Purchase order placed","Vendor drawings approved","Manufacturing complete / FAT passed","Shipped / in transit","Delivered to site and inspected"]},

{id:"SQ2", lvl:2, xp:90, title:"The monthly update cycle",
 intro:"Put the eight steps of a disciplined update cycle in order. Two of these are commonly done in the wrong order, and it matters.",
 items:["Freeze the cut-off and collect progress data","Copy the schedule and rename it with the data date","Enter actual dates, quantities and physical percent complete","Re-judge remaining durations on the driving activities","Set the data date and reschedule","Read the schedule log","Analyse critical path movement and float erosion","Report, issue the look-ahead and update the delay register"]},

{id:"SQ3", lvl:4, xp:90, title:"Time Impact Analysis — the four steps",
 intro:"Order the four steps of a properly conducted time impact analysis.",
 items:["Select the accepted programme updated to immediately before the delay event","Build the delay event as a fragnet and link it into the base programme","Reschedule and measure the movement in projected completion","Repeat for the next event in chronological order"]},

{id:"SQ4", lvl:1, xp:90, title:"Substation construction sequence",
 intro:"Order the principal construction stages of a 220/33kV substation from earliest to latest.",
 items:["Site clearance, grading and access roads","Earthing grid installation","Foundations — transformer, gantry and GIS building","Control building superstructure","GIS building erection and cladding","GIS bay erection and gas filling","Transformer positioning and oil filling","Cable installation and termination","Protection and control panel installation","Pre-commissioning and point-to-point checks","HV withstand testing","Energisation and provisional acceptance"]},

{id:"SQ5", lvl:4, xp:90, title:"The extension of time claim structure",
 intro:"Order the ten parts of a well-constructed EOT claim document.",
 items:["Executive summary","Contractual basis and notice history","The project and the accepted baseline","Chronological narrative of events","The delay events, described individually","Delay analysis — method, base programmes, results","Concurrency addressed openly","Quantum — prolongation and disruption","Mitigation undertaken","Appendices — notices, records, programmes, photographs"]}
];

/* ========================================================================== *
 *  DECISION SCENARIOS — branching, with realistic consequences
 * ========================================================================== */
var DECISIONS = [
{id:"DC1", lvl:3, title:"The board wants one number",
 scenario:"You are at 60% complete on a AED 240 million EPC package. CPI has been between 0.90 and 0.92 for five consecutive months. The project manager needs a single cost number for the board tomorrow morning and says the client 'does not want to hear about a forecast overrun before the mid-term review'.",
 opts:[
  {t:"Publish BAC unchanged and note that recovery actions are in progress",
   xp:0, v:"weak",
   o:"This buys one month and costs you the department's credibility. The overrun is arithmetically certain at a sustained CPI of 0.91 — EAC is around AED 264 million — and when it surfaces at the mid-term review the first question will be when project controls knew. The honest answer will be 'five months ago', and it will be documented in your own monthly reports."},
  {t:"Publish EAC = BAC ÷ CPI and state the assumption plainly",
   xp:50, v:"defensible",
   o:"Defensible and standard. EAC = 240 ÷ 0.91 = AED 263.7 million, forecast overrun about AED 24 million, on the explicit assumption that past cost performance continues. This is the mainstream professional answer and no one can criticise the method. It is one step short of the strongest response because it hands the board a number without telling them whether it can still be changed."},
  {t:"Compute TCPI alongside EAC and present the recovery question as a decision",
   xp:70, v:"strong",
   o:"The strongest answer. TCPI to recover the original budget = (240 − 144) ÷ (240 − 158.2) = 1.174 against a demonstrated CPI of 0.91. That gap of 0.26 says recovery to budget is not credible without a structural change. You are now giving the board a decision — accept the AED 264 million forecast, reduce scope, or fund a method change — rather than a number to be alarmed by. This is what senior planners are paid for."},
  {t:"Ask for a week to rebuild the estimate bottom-up before reporting anything",
   xp:25, v:"defensible",
   o:"Not unreasonable in principle — a bottom-up ETC is more accurate than an index-based extrapolation, and after five stable months you have the data to do it well. But it is the wrong answer to tonight's question. The board meets tomorrow and you already have five months of consistent evidence. Report the index-based forecast now with the caveat, and offer the bottom-up rebuild as the follow-up. Withholding a defensible number because a better one exists later is how planning departments lose their seat."}
 ]},

{id:"DC2", lvl:4, title:"Which method, and can you defend it?",
 scenario:"A dispute has arisen 14 months after practical completion. The contractor has an accepted baseline and complete monthly P6 updates for the full 26-month project, good site diaries, but never recorded as-built logic. The contract is unamended FIDIC 1999 and does not mandate an analysis method. Your client is the contractor.",
 opts:[
  {t:"Collapsed as-built — it demonstrates but-for causation most powerfully",
   xp:10, v:"weak",
   o:"Collapsed as-built (SCL method 6, AACE MIP 3.8/3.9) requires a logic-linked as-built programme, which does not exist here. You would have to infer the as-built logic 14 months after completion, and that inference becomes the central assumption of your entire opinion. An opposing expert will attack it first and will probably succeed. Choosing a method whose foundational input has to be invented is the most common way a good case is weakened."},
  {t:"Impacted as-planned — the baseline was accepted, so the comparison is agreed",
   xp:0, v:"weak",
   o:"The weakest option available. Impacted as-planned (MIP 3.6) inserts events into an untouched baseline and ignores everything that actually happened over 26 months. Here it is not merely weak — it is indefensible, because the contractor holds complete contemporaneous updates. An expert who discards the best record set in the case in favour of the simplest method has handed the other side their opening argument."},
  {t:"Time slice windows analysis on the contemporaneous updates",
   xp:70, v:"strong",
   o:"Correct, and for the right reason: the method follows the records. Complete monthly updates are exactly what time slice (SCL method 3, AACE MIP 3.3) needs, and it shows the critical path moving through the project as it actually did — which is far more persuasive retrospectively than any model built on the baseline alone. Justify it explicitly by reference to the record set, and state why you rejected collapsed as-built and impacted as-planned. That justification is itself part of the opinion."},
  {t:"Retrospective longest path — the project is complete, so use the actual outcome",
   xp:35, v:"defensible",
   o:"A legitimate retrospective method (SCL method 5) and it would produce a usable answer. But it relies on pure hindsight and discards the contemporaneous updates, which are this contractor's single strongest asset. It is also more vulnerable to the criticism that it ignores what the parties knew at the time. Reasonable as a cross-check to run alongside the time slice; weaker as the primary analysis."}
 ]},

{id:"DC3", lvl:4, title:"The client will not grant the extension",
 scenario:"Your contractor client is 40 days into a properly notified delay caused by late employer approvals. Notice was served within 28 days and particulars submitted. The Engineer has neither granted nor rejected the EOT for nine weeks. The client's project director tells your project manager verbally that 'the date is the date' and expects the original completion. Liquidated damages run at AED 180,000 per day.",
 opts:[
  {t:"Accelerate immediately to protect the date and sort out the commercials later",
   xp:5, v:"weak",
   o:"This is how contractors pay for the employer's delay. Accelerating without a written instruction and without reserving your position risks a finding that you accelerated voluntarily. 'Sort it out later' means arguing for constructive acceleration with no contemporaneous record of the reservation — the single hardest claim to win. The acceleration itself may be the right operational move; doing it in this order is the mistake."},
  {t:"Write to the Engineer requiring a determination, reserve rights, price the acceleration, then accelerate",
   xp:70, v:"strong",
   o:"Correct sequence. You establish the record: entitlement properly notified, determination not made within the contractual period, rights expressly reserved, acceleration costs identified in advance and notified as a claim. That chain — valid notice, entitlement demonstrated, failure to grant, acceleration reasonably incurred — is precisely what a constructive acceleration claim requires. Same physical action as option one, radically different commercial position, and the difference costs one letter."},
  {t:"Stop work on the affected front until the Engineer determines the EOT",
   xp:0, v:"weak",
   o:"Suspension is a contractual remedy with strict preconditions and this is not one of them. Failure to determine an EOT does not entitle the contractor to suspend. You would convert an employer-caused delay into a contractor default, expose yourself to termination arguments, and lose an entitlement you currently have. Never respond to a commercial dispute with an unauthorised operational stoppage."},
  {t:"Continue at current rate, keep the records, and claim the extension of time later",
   xp:40, v:"defensible",
   o:"Genuinely defensible, and the right call if the acceleration cost would exceed the exposure. You maintain entitlement, avoid spending money you may not recover, and accept the LD risk in the knowledge that a valid EOT should ultimately defeat it. It is weaker than option two only because it makes no attempt to force the determination — leaving an undetermined claim sitting for nine weeks lets the record go cold. Two options here are defensible and the choice turns on the numbers, which is the realistic position."}
 ]},

{id:"DC4", lvl:2, title:"The baseline the client will not accept",
 scenario:"Your baseline has been rejected twice. The stated grounds are 340 activities with no successor, 62 hard constraints, and a progress measurement basis using duration percent complete throughout. The project director wants it accepted this week because the first payment application depends on it.",
 opts:[
  {t:"Link all 340 open-ended activities to the completion milestone and remove the constraints",
   xp:10, v:"weak",
   o:"This passes the tests and destroys the programme. Three hundred and forty activities linked directly to project completion produces a network where everything appears to drive the finish date, float values become meaningless, and any future delay analysis is worthless. A reviewer who sees it knows exactly what was done — and now doubts everything else in the file. You have converted a fixable defect into a permanent credibility problem."},
  {t:"Fix the logic properly, justify the constraints that are genuine, delete the rest, and convert to physical percent with rules of credit",
   xp:70, v:"strong",
   o:"The correct answer and the one that takes longest. Real successor logic on 340 activities is perhaps a week of work with the construction team — which is also the week in which the programme becomes something site recognises. Genuine constraints (a fixed outage window, a contractual access date) stay and are justified in writing in the constraints register; the rest go. Rules of credit for physical percent need client agreement anyway, so start that conversation now rather than at the first progress claim."},
  {t:"Submit the same programme with a covering letter explaining that the defects are immaterial",
   xp:0, v:"weak",
   o:"Three rejections is a relationship problem, not a documentation problem. The defects are not immaterial: 340 dangling finishes mean the critical path is not reliable, and duration percent complete throughout means progress cannot be verified. Arguing the point costs another cycle, delays the payment application further, and confirms to the reviewer that the contractor either does not understand the objections or is not taking them seriously."},
  {t:"Propose an interim conditional acceptance for payment purposes while the corrections are made",
   xp:45, v:"defensible",
   o:"Pragmatic and often what actually happens. Many clients will accept a programme 'for payment purposes only, without prejudice' against a written corrective action plan with dates. It unblocks the cash while the real fix proceeds. It scores below option two because conditional acceptances have a way of becoming permanent, and a contractor operating for months against a programme the client has not truly accepted is exposed if a delay dispute arises in that window. Use it as a bridge, with the corrective plan genuinely resourced."}
 ]}
];

/* ========================================================================== *
 *  SPEED DRILLS — 15 seconds per question, 3 hearts
 * ========================================================================== */
var DRILLS = [
{id:"DR1", lvl:1, title:"Formula recall — CPM and float",
 qs:[
  {q:"Total float =",                       o:["LS − ES","ES − LS","EF − LF","LF + EF"], a:0},
  {q:"Free float =",                        o:["LF − EF","min successor ES − EF","LS − ES","EF − ES"], a:1},
  {q:"Early finish =",                      o:["ES + duration","LS + duration","LF − duration","ES − duration"], a:0},
  {q:"Late start =",                        o:["LF + duration","LF − duration","EF − duration","ES + duration"], a:1},
  {q:"Forward pass: successor ES is the …", o:["minimum predecessor EF","maximum predecessor EF","average predecessor EF","first predecessor EF"], a:1},
  {q:"Backward pass: predecessor LF is the …",o:["maximum successor LS","minimum successor LS","maximum successor LF","minimum successor EF"], a:1},
  {q:"The critical path is properly defined as the …",o:["chain with least float","shortest path","longest path through the network","most resourced chain"], a:2},
  {q:"Negative float means",                o:["an error in the network","the imposed date is earlier than logic allows","spare time available","the activity is complete"], a:1},
  {q:"Total float on a chain is",           o:["owned per activity","shared along the chain","always equal to free float","always zero"], a:1},
  {q:"An activity with no successor will",  o:["always be critical","never appear on the critical path","have zero float","be deleted by P6"], a:1}
 ]},
{id:"DR2", lvl:3, title:"Formula recall — earned value",
 qs:[
  {q:"CPI =",   o:["EV ÷ PV","EV ÷ AC","AC ÷ EV","PV ÷ EV"], a:1},
  {q:"SPI =",   o:["EV ÷ AC","EV ÷ PV","PV ÷ AC","AC ÷ PV"], a:1},
  {q:"SV =",    o:["EV − AC","EV − PV","PV − EV","AC − EV"], a:1},
  {q:"CV =",    o:["EV − PV","EV − AC","AC − EV","BAC − EV"], a:1},
  {q:"Earned value is measured in",o:["actual spend","budgeted cost of work performed","forecast cost","remaining budget"], a:1},
  {q:"Standard EAC assuming performance continues =",o:["AC + (BAC − EV)","BAC ÷ CPI","BAC − EV","AC ÷ CPI"], a:1},
  {q:"VAC =",   o:["BAC − EAC","EAC − BAC","BAC − EV","EAC − AC"], a:0},
  {q:"ETC =",   o:["BAC − EV","EAC − AC","AC − EV","BAC ÷ CPI"], a:1},
  {q:"TCPI to the original budget =",o:["(BAC − EV) ÷ (BAC − AC)","(BAC − AC) ÷ (BAC − EV)","EV ÷ AC","(EAC − AC) ÷ (BAC − EV)"], a:0},
  {q:"SPI(t) =",o:["ES ÷ AT","AT ÷ ES","EV ÷ PV","ES − AT"], a:0}
 ]},
{id:"DR3", lvl:3, title:"DCMA thresholds",
 qs:[
  {q:"Leads (negative lags) permitted",        o:["0%","5%","10%","No limit"], a:0},
  {q:"Minimum Finish-to-Start relationships",  o:["50%","75%","90%","100%"], a:2},
  {q:"Maximum activities with missing logic",  o:["0%","5%","10%","15%"], a:1},
  {q:"High duration threshold",                o:["20 days","30 days","44 days","60 days"], a:2},
  {q:"High float threshold",                   o:["20 days","44 days","60 days","100 days"], a:1},
  {q:"Activities permitted with negative float",o:["0","5%","10%","Any number if justified"], a:0},
  {q:"Maximum hard constraints",               o:["0%","5%","10%","20%"], a:1},
  {q:"CPLI passing threshold",                 o:["0.85","0.90","0.95","1.00"], a:2},
  {q:"BEI passing threshold",                  o:["0.80","0.90","0.95","1.05"], a:2},
  {q:"The critical path test injects",         o:["60 days","100 days","600 days","1000 days"], a:2}
 ]},
{id:"DR4", lvl:4, title:"Contract and forensic recall",
 qs:[
  {q:"FIDIC notice period for claims",          o:["14 days","21 days","28 days","42 days"], a:2},
  {q:"FIDIC 1999 extension of time clause",     o:["8.3","8.4","8.7","20.1"], a:1},
  {q:"FIDIC 2017 extension of time clause",     o:["8.3","8.4","8.5","20.2"], a:2},
  {q:"FIDIC clause governing the programme",    o:["8.3","8.4","4.21","13"], a:0},
  {q:"The Silver Book is",                      o:["Construction, employer design","Plant &amp; design-build","EPC / turnkey","Short form"], a:2},
  {q:"Under genuine concurrency the usual outcome is",o:["time and money","time but not money","money but not time","neither"], a:1},
  {q:"Time impact analysis uses as its base",   o:["the original baseline","the programme updated to just before the event","the as-built","the recovery programme"], a:1},
  {q:"Impacted as-planned is AACE MIP",         o:["3.3","3.6","3.7","3.9"], a:1},
  {q:"The most reliable disruption method is",  o:["total cost","industry studies","measured mile","modified total cost"], a:2},
  {q:"Exceptionally adverse weather is normally",o:["excusable and compensable","excusable, non-compensable","non-excusable","a variation"], a:1}
 ]},
{id:"DR5", lvl:2, title:"Definitions and terminology",
 qs:[
  {q:"PERT expected duration te =",             o:["(O + M + P) ÷ 3","(O + 4M + P) ÷ 6","(P − O) ÷ 6","(O + 2M + P) ÷ 4"], a:1},
  {q:"PERT standard deviation =",               o:["(P − O) ÷ 6","(P − O) ÷ 3","(O + 4M + P) ÷ 6","√(P − O)"], a:0},
  {q:"Along a path, what adds?",                o:["standard deviations","variances","confidence levels","criticality indices"], a:1},
  {q:"A PERT chart is",                         o:["three-point estimating","a network diagram","an S-curve","a histogram"], a:1},
  {q:"The 100% rule states",                    o:["all activities must be 100% complete","children sum to exactly the parent","float must be 100% consumed","progress must reach 100%"], a:1},
  {q:"A control account is the intersection of",o:["WBS and CBS","WBS and OBS","CBS and OBS","WBS and calendar"], a:1},
  {q:"Work package guideline size",             o:["0.5–2% of project value","5–10%","10–15%","under 0.1%"], a:0},
  {q:"Physical percent complete moves the forecast finish date",o:["yes, always","no — only remaining duration does","only in P6","only if resource loaded"], a:1},
  {q:"Retained logic generally produces a finish date that is",o:["earlier","later","identical","undefined"], a:1},
  {q:"The periodic S-curve peak sits",          o:["at handover","mid-project during construction","in month one","at 90% complete"], a:1}
 ]}
];

/* ========================================================================== *
 *  BOSS BATTLES
 *  Stage types: mcq | mcqs | calc | calcs | multi | order
 *  3 hearts, no hints, no reveals. 400 XP and a rank on defeat.
 * ========================================================================== */
var BOSSES = [

/* ---------------------------------------------------------------- BOSS 1 -- */
{id:"B1", lvl:1, name:"THE NETWORK", badge:"paths",
 tag:"Eight activities. One network. No software.",
 intro:"A contractor has submitted an eight-activity fragment of a substation programme. You have durations and logic and nothing else. Compute it by hand — forward pass, backward pass, float — and answer six questions.",
 brief:[
  {p:"All relationships are Finish-to-Start with zero lag. All activities are on the same calendar. Use day 0 as the project start, so an activity starting on day 0 with a duration of 5 finishes on day 5."},
  {tbl:[["ID","Activity","Duration","Predecessors"],[
   ["A","Site establishment","5","— (project start)"],
   ["B","Foundation excavation","8","A"],
   ["C","Earthing grid","6","A"],
   ["D","Foundation concrete","10","B"],
   ["E","Cable trench","4","C"],
   ["F","GIS erection","7","D, E"],
   ["G","Perimeter works","5","C"],
   ["H","Testing &amp; energisation","3","F, G"]
  ]]},
  {tip:["Work it properly","Draw the network. Forward pass taking the maximum at every merge, backward pass taking the minimum at every burst, then TF = LS − ES. It takes about four minutes on paper."]}
 ],
 stages:[
  {type:"calc", q:"<b>Stage 1 of 6.</b> What is the total project duration, in days?",
   a:33, tol:0.01, unit:"days",
   why:"Forward pass: A 0→5. B 5→13, C 5→11. D 13→23, E 11→15, G 11→16. F merges D (23) and E (15), taking the maximum: 23→30. H merges F (30) and G (16): 30→33. Project duration is 33 days."},

  {type:"mcq", q:"<b>Stage 2 of 6.</b> Which chain is the critical path?",
   opts:["A → C → E → F → H","A → B → D → F → H","A → C → G → H","A → B → D → F → G → H"],
   a:1,
   why:"A→B→D→F→H = 5+8+10+7+3 = 33 days, equal to the project duration, so it is the longest path. A→C→E→F→H = 5+6+4+7+3 = 25. A→C→G→H = 5+6+5+3 = 19. Option (d) is not a valid path at all — G does not follow F."},

  {type:"calcs", q:"<b>Stage 3 of 6.</b> Give the <b>total float</b> for the three named activities.",
   parts:[{l:"Activity C",a:8},{l:"Activity E",a:8},{l:"Activity G",a:14}], tol:0.01,
   why:"Backward pass from LF(H)=33. H: LS 30. F: LF 30, LS 23. G: LF 30, LS 25. D: LF 23, LS 13. E: LF 23, LS 19. B: LF 13, LS 5. C: LF = min(LS of E 19, LS of G 25) = 19, LS 13. TF = LS − ES: C = 13 − 5 = 8. E = 19 − 11 = 8. G = 25 − 11 = 14."},

  {type:"calcs", q:"<b>Stage 4 of 6.</b> Give the <b>free float</b> for the two named activities.",
   parts:[{l:"Activity E",a:8},{l:"Activity G",a:14}], tol:0.01,
   why:"Free float = minimum successor ES − this activity's EF. E finishes at 15 and its only successor F starts at 23, so FF = 23 − 15 = 8. G finishes at 16 and its only successor H starts at 30, so FF = 30 − 16 = 14. Both happen to equal their total float here because each is the last activity on its own float chain — which is the general pattern worth noticing."},

  {type:"mcq", q:"<b>Stage 5 of 6.</b> Activity <b>C is re-estimated from 6 days to 16 days</b>. Everything else is unchanged. Which chain is now the critical path?",
   opts:["A → B → D → F → H, unchanged at 33 days","A → C → E → F → H, at 35 days","A → C → G → H, at 29 days","Both A→B→D→F→H and A→C→E→F→H, tied at 35 days"],
   a:1,
   why:"Recompute: A 0→5, C 5→21, E 21→25, G 21→26, B 5→13, D 13→23. F merges D (23) and E (25), so F is 25→32. H merges F (32) and G (26), so H is 32→35. Project duration is now 35 days and the driving chain is A→C→E→F→H = 5+16+4+7+3 = 35. The old critical path A→B→D→F→H still totals 33 and is no longer critical — a ten-day change to one activity moved the critical path onto a completely different chain."},

  {type:"mcq", q:"<b>Stage 6 of 6.</b> With C at 16 days, which chain is now <b>near-critical</b>, and with how much total float?",
   opts:["A → C → G → H, with 6 days","A → B → D → F → H, with 2 days","A → C → G → H, with 2 days","A → B → D → F → H, with 6 days"],
   a:1,
   why:"The former critical path A→B→D→F→H now totals 33 days against a project duration of 35, giving it 2 days of total float. Check by backward pass: LF(H)=35, LS(H)=32; F LF 32, LS 25; D LF 25, LS 15; B LF 15, LS 7; TF(B) = 7 − 5 = 2. The chain A→C→G→H totals 29 days and G carries 6 days of float. Two days on a chain that was critical last month is the definition of near-critical, and it is exactly what a recovery plan must not ignore."}
 ]},

/* ---------------------------------------------------------------- BOSS 2 -- */
{id:"B2", lvl:2, name:"THE BASELINE SUBMISSION", badge:"dcma",
 tag:"You are the client's reviewer. Accept or reject.",
 intro:"A contractor has submitted its Level 3 baseline for a 220/33kV substation, contract duration 780 working days, value AED 310 million. You are the PMC reviewer. Five stages.",
 brief:[
  {h:"Schedule statistics as submitted"},
  {tbl:[["Metric","Value","Metric","Value"],[
   ["Total activities","2,140","Relationships","3,880"],
   ["Activities missing predecessor or successor","206","Leads (negative lags)","31"],
   ["Relationships with lags","174","Finish-to-Start relationships","3,240"],
   ["Hard constraints","58","Activities with negative float","0"],
   ["Activities with TF &gt; 44 days","162","Activities with duration &gt; 44 days","94"],
   ["Invalid dates","0","Activities &gt;0 duration with no resource","11"],
   ["Critical path length (working days)","780","Total float on driving path","+34 days"],
   ["Progress measurement basis","Duration % throughout","Curing / oil filtration calendar","6-day site calendar"]
  ]]},
  {h:"Extract from the submitted S-curve"},
  {tbl:[["Elapsed duration","Cumulative planned value"],[
   ["10%","3%"],["25%","9%"],["50%","28%"],["75%","58%"],["90%","79%"],["100%","100%"]
  ]]},
  {tip:["Compute before you judge","Every DCMA test in stage 1 is a percentage. Work them out against the totals above rather than reacting to the raw counts — 206 sounds alarming and 31 sounds small, and one of those instincts is wrong."]}
 ],
 stages:[
  {type:"multi", q:"<b>Stage 1 of 5.</b> Run the DCMA checks against the statistics. Select <b>every test that FAILS</b>. There are five.", pick:5,
   opts:[
    "Test 1 — Logic: activities missing predecessor or successor",
    "Test 2 — Leads: negative lags",
    "Test 3 — Lags: relationships carrying lags",
    "Test 4 — Relationship types: percentage Finish-to-Start",
    "Test 5 — Hard constraints",
    "Test 6 — High float: activities above 44 days total float",
    "Test 7 — Negative float",
    "Test 8 — High duration: activities above 44 days",
    "Test 9 — Invalid dates",
    "Test 13 — CPLI"
   ],
   a:[0,1,3,5,7],
   why:"Test 1: 206 ÷ 2,140 = 9.6% against a 5% limit — FAIL. Test 2: 31 leads against a limit of zero — FAIL. Test 3: 174 ÷ 3,880 = 4.5%, within 5% — pass. Test 4: 3,240 ÷ 3,880 = 83.5% FS against a 90% minimum — FAIL. Test 5: 58 ÷ 2,140 = 2.7%, within 5% — pass, though 58 constraints still each need justification. Test 6: 162 ÷ 2,140 = 7.6% against 5% — FAIL. Test 7: zero negative float — pass. Test 8: 94 ÷ 2,140 = 4.4%, within 5% — pass. Test 9: zero invalid dates — pass. Test 13: CPLI = (780 + 34) ÷ 780 = 1.04, above 0.95 — pass. The lesson of this stage is that raw counts mislead: 94 long activities passes while 31 leads fails outright, because one test is a percentage and the other is an absolute zero."},

  {type:"multi", q:"<b>Stage 2 of 5.</b> Beyond the DCMA metrics, select the <b>four structural defects</b> visible in this submission.", pick:4,
   opts:[
    "Curing and oil filtration are on the 6-day site calendar rather than a 7-day continuous calendar",
    "Progress measurement uses duration percent complete throughout",
    "The critical path carries +34 days of total float against a contract duration of 780 days",
    "The submitted completion date matches the contract completion date",
    "There are 3,880 relationships for 2,140 activities",
    "Eleven activities with duration greater than zero carry no resource in a resource-loaded programme"
   ],
   a:[0,1,2,5],
   why:"(a) Curing and filtration are physical processes that do not stop for Friday — on a 6-day calendar every cure in the project is understated. (b) Duration percent complete measures the calendar rather than the work and cannot be verified; this alone is a common ground for rejection. (c) A driving path finishing 34 days before the contract date is float the contractor has exposed — worth querying, because it either means the programme is not truly driving to the contract date or a constraint is holding the finish milestone. (f) Unresourced activities in a resource-loaded programme break the S-curve and fail DCMA test 10. Option (d) is not a defect — matching the contract date is normal and expected. Option (e) is a ratio of 1.81 relationships per activity, which is entirely healthy."},

  {type:"mcq", q:"<b>Stage 3 of 5.</b> Classify the shape of the submitted S-curve from the extract, and identify the consequence.",
   opts:[
    "Front-loaded — value is pulled into early activities to improve early cash flow",
    "Back-loaded — only 28% of value at the halfway point, requiring 42% of value in the final quarter",
    "Normal — the curve is a conventional S with a mid-project peak",
    "Linear — value is spread evenly across the duration"
   ],
   a:1,
   why:"At 50% elapsed duration only 28% of value is earned; the final 25% of duration must deliver 100% − 58% = 42% of the total value. That is a back-loaded curve, and it is the classic shape of a programme that has been fitted to a fixed end date rather than built from resourced production. The consequence is a manpower demand concentrated into the final quarter, when testing, commissioning and handover are already competing for access — the period with the least recovery capacity. A normal S-curve would show roughly 45–55% of value at the halfway point."},

  {type:"mcq", q:"<b>Stage 4 of 5.</b> The contractor argues that duration percent complete is acceptable because 'the activities are short, so elapsed time is a fair proxy for work done'. Is the progress measurement basis acceptable?",
   opts:[
    "Yes — with 94 activities above 44 days the majority are short, so the proxy holds",
    "No — duration percent measures elapsed calendar time and requires no verification, so progress can never be audited against physical work",
    "Yes, provided the contractor also submits a monthly physical progress report separately",
    "No, but only for the 94 activities exceeding 44 days; the remainder may use duration percent"
   ],
   a:1,
   why:"Duration percent complete is computed by the software from elapsed time against the data date. It requires no input, no inspection and no honesty — an activity that has started and done nothing will report progress simply because time has passed. It also cannot be reconciled to a rule of credit, so a payment application built on it cannot be verified. The activity length argument is irrelevant: the defect is that the measure is not a measure of work. Option (c) creates two conflicting progress figures, which is worse. Option (d) concedes the principle and then abandons it — if duration percent is unverifiable it is unverifiable at every duration. Physical percent against agreed rules of credit is required, and this is one of the most common single grounds for baseline rejection in practice."},

  {type:"multi", q:"<b>Stage 5 of 5.</b> Write the rejection. Select the <b>three strongest grounds</b> from the eight below — the ones that go to whether the programme can be relied on at all.", pick:3,
   opts:[
    "9.6% of activities have missing logic, so the critical path and all float values are unreliable",
    "Progress cannot be verified because measurement is on duration percent complete throughout",
    "31 leads are present against a required zero",
    "The S-curve is back-loaded, placing 42% of value in the final quarter of the duration",
    "Curing and oil filtration are on the wrong calendar",
    "162 activities exceed 44 days of total float",
    "Eleven activities carry no resource assignment",
    "58 hard constraints are present without a constraints register"
   ],
   a:[0,1,3],
   why:"The three strongest grounds are those that make the programme unusable as a control instrument rather than merely imperfect. (a) With 9.6% missing logic the network does not calculate reliably, so the critical path, every float value and any future delay analysis are unsound — this is the most fundamental objection. (b) Without verifiable progress measurement, no update, no payment application and no earned value figure can be audited. (d) A back-loaded curve concentrating 42% of value into the final quarter is not resourceable alongside testing and handover, so the plan is not executable. The others are all genuine defects and all belong in the rejection letter — but leads, calendars, high float, missing resources and constraint justifications are correctable items within a sound programme, whereas the three selected go to whether it is a sound programme at all. Ranking your grounds is what makes a rejection letter persuasive rather than a list of complaints."}
 ]},

/* ---------------------------------------------------------------- BOSS 3 -- */
{id:"B3", lvl:3, name:"THE MONTHLY REPORT", badge:"cost",
 tag:"Month 14 of 24. The numbers are in. Diagnose it.",
 intro:"You are the project controls manager on an EPC package. It is month 14 of a 24-month programme and the earned value data has just closed. Six stages.",
 brief:[
  {h:"Earned value data at month 14"},
  {tbl:[["Quantity","Value (AED)"],[
   ["Budget at Completion (BAC)","180,000,000"],
   ["Planned Value (PV)","98,000,000"],
   ["Earned Value (EV)","84,000,000"],
   ["Actual Cost (AC)","96,000,000"]
  ]]},
  {h:"Baseline planned value curve (cumulative, AED million)"},
  {tbl:[["Month","10","11","12","13","14"],[
   ["Cumulative PV","64.0","72.0","80.0","90.0","98.0"]
  ]]},
  {tip:["Round sensibly","Give indices to three decimal places and currency to the nearest million where asked. Tolerances are set to accept reasonable rounding."]}
 ],
 stages:[
  {type:"calcs", q:"<b>Stage 1 of 6.</b> Compute the four core measures. Enter indices to three decimals and variances in AED millions (a negative number where appropriate).",
   parts:[{l:"SPI",a:0.857},{l:"CPI",a:0.875},{l:"SV (AED m)",a:-14},{l:"CV (AED m)",a:-12}], tol:0.02,
   why:"SPI = EV ÷ PV = 84 ÷ 98 = 0.857. CPI = EV ÷ AC = 84 ÷ 96 = 0.875. SV = EV − PV = 84 − 98 = −AED 14 million. CV = EV − AC = 84 − 96 = −AED 12 million. Both indices below 1.00 and both variances negative."},

  {type:"mcq", q:"<b>Stage 2 of 6.</b> Diagnose the quadrant and name the most likely cause.",
   opts:[
    "SPI &gt;1, CPI &lt;1 — buying the schedule through overtime and premium logistics",
    "SPI &lt;1, CPI &gt;1 — under-resourced; add people, the budget headroom exists",
    "SPI &lt;1, CPI &lt;1 — behind and overspent; a productivity failure, rework or disruption",
    "SPI &gt;1, CPI &gt;1 — performing well, but verify the progress claim before reporting it"
   ],
   a:2,
   why:"SPI 0.857 and CPI 0.875 place this in the fourth quadrant: behind schedule and over budget simultaneously. This is the serious diagnosis, because the two usual explanations for one index being poor do not apply — the project is not under-resourced (that would show CPI above 1.00) and it is not buying schedule (that would show SPI above 1.00). Spending more than budget while delivering less than planned points to a productivity failure, significant rework, disruption, or an original estimate that was never achievable. The management response is to find the cause before producing any forecast, because the forecast formula you choose depends on whether the cause is closed or continuing."},

  {type:"calcs", q:"<b>Stage 3 of 6.</b> Forecast the outturn assuming past cost performance continues. Give both figures in AED millions; VAC will be negative.",
   parts:[{l:"EAC (AED m)",a:205.7},{l:"VAC (AED m)",a:-25.7}], tol:1.2,
   why:"EAC = BAC ÷ CPI = 180 ÷ 0.875 = AED 205.7 million. VAC = BAC − EAC = 180 − 205.7 = −AED 25.7 million, a forecast overrun of about 14.3%. This is the standard forecast and the one to quote if asked for a single number. The optimistic alternative, EAC = AC + (BAC − EV) = 96 + 96 = AED 192 million, assumes the past variance was a one-off — which requires you to name the one-off event and show it is closed, and nothing in this data supports that."},

  {type:"calc", q:"<b>Stage 4 of 6.</b> Compute <b>TCPI to recover the original budget</b>, to three decimal places.",
   a:1.143, tol:0.012, unit:"",
   why:"TCPI = (BAC − EV) ÷ (BAC − AC) = (180 − 84) ÷ (180 − 96) = 96 ÷ 84 = 1.143. Read it against the demonstrated CPI of 0.875. The project has never performed better than 0.875 and would now have to sustain 1.143 for every remaining dirham — a step change of 0.268. The rule of thumb is that a gap above roughly 0.10 makes recovery unrealistic without a structural change, so recovery to the original budget here is not credible. Saying that plainly, in month 14 rather than month 20, is the entire value of computing TCPI."},

  {type:"mcqs", q:"<b>Stage 5 of 6.</b> The project manager has three follow-up questions. Choose the correct response to each.",
   parts:[
    {q:"1. \"Can we report EAC of AED 192 million using the optimistic formula? The disruption in months 8 to 11 was a one-off.\"",
     opts:["Yes — if the event is closed and evidenced, EAC = AC + (BAC − EV) is legitimate, but it must be labelled as assuming no recurrence and supported by the evidence that it has ended",
           "Yes — the optimistic formula is always acceptable for internal reporting",
           "No — only BAC ÷ CPI may ever be used",
           "No — EAC cannot be revised once reported"],
     a:0},
    {q:"2. \"If we recover the schedule, will CPI improve?\"",
     opts:["Yes — CPI and SPI move together by definition",
           "Not necessarily, and usually the opposite: recovering schedule normally means overtime, extra crews and premium logistics, which increases AC without increasing EV, pushing CPI down further",
           "Yes — earned value increases as activities complete, so CPI rises",
           "CPI is unaffected by schedule performance in all circumstances"],
     a:1},
    {q:"3. \"The client asks for one number for the forecast completion date. What do we give them?\"",
     opts:["The CPM forecast finish from the updated programme, with no qualification",
           "The IEAC(t) figure from Earned Schedule, since it is data-driven",
           "The CPM forecast finish, cross-checked against IEAC(t) — and if the two disagree materially, say so and explain that remaining durations are the reconciling item",
           "Refuse to give a date until the recovery plan is approved"],
     a:2}
   ],
   why:"Question 1: the optimistic EAC is legitimate when the variance genuinely was a discrete, closed event, but it must be labelled with that assumption and evidenced — you cannot simply prefer the better number. Question 2: this is the trap in the pair of indices. Accelerating consumes actual cost without adding earned value, so recovering schedule typically drives CPI down. A recovery plan that promises to fix both indices simultaneously is usually not costed. Question 3: CPM gives the date from the network's logic and remaining durations; Earned Schedule gives an independent, performance-based estimate. Reporting both and explaining a disagreement is far stronger than picking one, because a material gap between them is itself the finding — it means remaining durations have not been re-judged."},

  {type:"mcq", q:"<b>Stage 6 of 6.</b> Is SPI still a reliable schedule indicator at month 14 of 24, and what does Earned Schedule say? The baseline PV curve is given in the briefing.",
   opts:[
    "SPI is reliable; at 0.857 the project is about 14% behind, forecasting roughly 27.4 months",
    "SPI is beginning to lose reliability as PV approaches BAC. ES = 12.4 months, SPI(t) = 0.886, IEAC(t) = 27.1 months — a forecast overrun of about 3.1 months",
    "SPI is unreliable and Earned Schedule cannot be computed without the full monthly curve",
    "SPI is fully reliable until 100% complete; Earned Schedule adds nothing before month 20"
   ],
   a:1,
   why:"Find ES from the PV curve: EV is AED 84 million, and the baseline planned 80.0 by month 12 and 90.0 by month 13. So C = 12 and the interpolated fraction I = (84 − 80) ÷ (90 − 80) = 0.4, giving ES = 12.4 months. SV(t) = 12.4 − 14 = −1.6 months behind. SPI(t) = 12.4 ÷ 14 = 0.886. IEAC(t) = 24 ÷ 0.886 = 27.1 months, forecasting about a 3.1-month overrun. On reliability: SPI has not failed at month 14, but it is entering the region where PV flattens toward BAC and SPI drifts upward toward 1.00 regardless of lateness — the effect becomes pronounced in the final third. Note also that SPI (0.857) and SPI(t) (0.886) do not agree, which is normal and is exactly why both are reported. Option (a) misuses SPI as if it converted directly into duration, which it does not."}
 ]},

/* ---------------------------------------------------------------- BOSS 4 -- */
{id:"B4", lvl:4, name:"THE CLAIM", badge:"claim",
 tag:"Eighteen months. Mixed records. Prove it.",
 intro:"You are advising a contractor on a 220kV transmission substation, unamended FIDIC 1999 Yellow Book, original duration 18 months, completed 147 days late. Liquidated damages are AED 145,000 per day. Six stages.",
 brief:[
  {h:"The delay events"},
  {tbl:[["Ref","Event","Period","Notice"],[
   ["DE-01","Late site access to the switchyard area — employer failed to complete land handover","Months 1–3, 62 days","Served day 19"],
   ["DE-02","Contractor's GIS subcontractor mobilised 40 days late due to its own resource failure","Months 4–5, 40 days","n/a"],
   ["DE-03","Exceptionally adverse weather — recorded rainfall exceeding the 20-year mean for the region","Month 7, 18 days","Served day 12"],
   ["DE-04","Employer-instructed variation adding two 33kV feeder bays","Month 9, 55 days","Served day 24"],
   ["DE-05","Contractor rework on protection panel wiring following failed internal QA","Months 12–13, 34 days","n/a"]
  ]]},
  {h:"The record set"},
  {ul:[
   "Accepted Level 3 baseline, approved month 2",
   "Monthly P6 updates — <b>complete and accepted for months 1 to 8, then none until month 15</b>, then complete to completion",
   "Full site diaries, daily labour allocation sheets and photographs throughout",
   "Complete correspondence and notice file",
   "<b>No as-built logic recorded at any point</b>"
  ]},
  {warn:["The overlap","DE-04 (employer variation, month 9, 55 days) and DE-05 (contractor rework, months 12–13, 34 days) do not overlap. But DE-01 (employer, months 1–3) overlaps with a 28-day period in which the contractor's own piling subcontractor was also critically delayed — a fact recorded in the site diaries and which the employer's expert has found."]}
 ],
 stages:[
  {type:"mcqs", q:"<b>Stage 1 of 6.</b> Classify each of the five delay events.",
   parts:[
    {q:"DE-01 — Late site access, employer failed to complete land handover",
     opts:["Excusable and compensable","Excusable, non-compensable","Non-excusable"], a:0},
    {q:"DE-02 — Contractor's GIS subcontractor mobilised 40 days late",
     opts:["Excusable and compensable","Excusable, non-compensable","Non-excusable"], a:2},
    {q:"DE-03 — Exceptionally adverse weather beyond the 20-year mean",
     opts:["Excusable and compensable","Excusable, non-compensable","Non-excusable"], a:1},
    {q:"DE-04 — Employer-instructed variation adding two 33kV feeder bays",
     opts:["Excusable and compensable","Excusable, non-compensable","Non-excusable"], a:0},
    {q:"DE-05 — Contractor rework following failed internal QA",
     opts:["Excusable and compensable","Excusable, non-compensable","Non-excusable"], a:2}
   ],
   why:"DE-01 and DE-04 are employer acts — late access under Sub-Clause 2.1 and a variation under Clause 13 — giving both time and money. DE-03 is the textbook neutral event: exceptionally adverse weather is a standard ground for extension of time under Sub-Clause 8.4 but carries no cost entitlement, so it is time but not money. DE-02 and DE-05 are contractor-caused — subcontractor failure and the contractor's own rework — giving neither time nor money. The middle category is the one candidates most often get wrong by assuming that anything excusable must also be compensable."},

  {type:"mcq", q:"<b>Stage 2 of 6.</b> Choose the delay analysis method given the records that exist.",
   opts:[
    "Collapsed as-built — it demonstrates but-for causation most directly on a completed project",
    "Time slice windows analysis across the whole 18 months, using the monthly updates",
    "As-planned versus as-built windows analysis, using the site records to bridge the months 9–14 gap where updates are missing",
    "Impacted as-planned — the baseline was accepted, which makes it the agreed measuring stick"
   ],
   a:2,
   why:"The record set decides this. There is a six-month gap in the updates covering months 9 to 14 — which is precisely where DE-04, the largest employer event, sits. That gap rules out a whole-project time slice (b), because time slice depends on reliable contemporaneous updates through the analysis period; you would have to reconstruct the missing ones, which moves you into AACE MIP 3.5 territory while calling it something else. Collapsed as-built (a) requires as-built logic, which was never recorded. Impacted as-planned (d) ignores the as-built entirely and is the weakest available option. As-planned versus as-built windows (SCL method 4) is designed for exactly this situation: it uses the strong site diary, labour allocation and photographic record to establish what actually happened in the windows where updates are absent, and it can use the good updates where they exist. It carries more judgement and is therefore more arguable — say so when you present it, because conceding the limitation is what makes the opinion credible."},

  {type:"mcq", q:"<b>Stage 3 of 6.</b> The employer's expert argues that DE-01 is defeated by concurrency: the contractor's piling subcontractor was critically delayed for 28 days within the same window. How do you respond?",
   opts:[
    "Reject the argument outright — DE-01 was notified on day 19 and notice defeats concurrency",
    "Concede the full 62 days of DE-01, since any concurrency destroys the entire event",
    "Apply the four tests. If both delays were critical, overlapping and independently sufficient, concede genuine concurrency for the 28-day overlap only — claiming time but not money for that period — and maintain full time and money for the remaining 34 days",
    "Argue apportionment and offer to split the 62 days equally"
   ],
   a:2,
   why:"Concurrency is assessed period by period, not event by event. Run the four tests on the 28-day overlap: were both delays on the critical path, did they overlap in effect, was each independently capable of causing the delay, and what does the contract say. If genuine concurrency is established for those 28 days, the mainstream English position gives time but not money for that period — the contractor keeps relief from liquidated damages but recovers no prolongation cost, because it would have incurred those costs anyway. The remaining 34 days of DE-01 are unaffected and carry both time and money. Option (a) confuses notice with causation; a valid notice preserves the claim but does not answer a concurrency argument. Option (b) surrenders 34 days for no reason. Option (d) is the Scots apportionment approach from City Inn, which was not followed in England and would be a weak opening position here."},

  {type:"mcq", q:"<b>Stage 4 of 6.</b> Taking the analysis as a whole, what is the entitlement position you would advise?",
   opts:[
    "Time and money for the full 147 days, since employer events were the dominant cause overall",
    "Time for the employer and neutral events, money for the employer events only — and no entitlement for the 74 days attributable to DE-02 and DE-05, with time but not money for the 28-day concurrent period",
    "Nothing — the gap in the monthly updates makes the whole claim unprovable",
    "Time only, with no money at all, because concurrency exists somewhere in the 18 months"
   ],
   a:1,
   why:"Entitlement is built event by event, not as a global figure. DE-01 and DE-04 are employer events giving time and money, subject to the 28-day concurrent period within DE-01 which yields time but not money. DE-03 is neutral — 18 days of time only. DE-02 (40 days) and DE-05 (34 days) are contractor-caused and give nothing; they also matter because they reduce the net delay the contractor can claim against the 147 days. Option (a) applies dominant cause across the whole project, which no tribunal would accept where contractor delays are documented. Option (c) overstates the effect of the update gap — the site records support an as-planned versus as-built analysis. Option (d) applies a concurrency finding from one 28-day window to the entire claim, which is not how concurrency works."},

  {type:"order", q:"<b>Stage 5 of 6.</b> Rank the evidence pack by what actually decides claims — most decisive first.",
   items:[
    "The notice file — proof that every claimed event was notified within 28 days",
    "Contemporaneous site diaries, labour allocation sheets and photographs",
    "Demonstrated causation — that each event delayed completion, not merely that it occurred",
    "The accepted baseline programme",
    "The delay analysis method, justified against the available records",
    "Substantiated quantum from actual cost records for the delay periods",
    "Clear presentation and cross-referencing of the appendices"
   ],
   why:"Notice is first because it is a condition precedent under unamended Sub-Clause 20.1 — it fails absolutely and no merit survives it. Contemporaneous records are second because they cannot be manufactured later and carry far more weight than reconstruction; here they are also what makes the chosen method possible. Causation is third: proving the event happened is not proving it delayed completion. The accepted baseline is fourth — without an agreed measuring stick every comparison is arguable. The analysis method is only fifth, which is the point of this ranking: contractors routinely spend heavily on expert analysis for claims already extinguished by a missed notice. Quantum is sixth, and presentation seventh — an assessor who cannot follow the document will not award it."},

  {type:"mcqs", q:"<b>Stage 6 of 6.</b> The Engineer raises three rebuttal points. Choose the correct response to each.",
   parts:[
    {q:"1. \"Your notice for DE-04 was served on day 24, but the variation instruction was issued on day 1 of that month. You are within 28 days, but you clearly knew earlier.\"",
     opts:["Concede — awareness predates the instruction, so the notice is late",
           "The 28 days runs from awareness of the event or circumstance. The variation instruction is the event, and notice at day 24 is within time. If the Engineer alleges earlier awareness, the burden is on them to identify what the contractor knew and when",
           "Argue that the notice period does not apply to variations",
           "Withdraw DE-04 and rely on DE-01 alone"],
     a:1},
    {q:"2. \"Your prolongation cost is calculated as contract preliminaries divided by contract duration, multiplied by the days claimed. That is a reasonable approach.\"",
     opts:["Agree — it is the standard industry method",
           "Do not use it. Prolongation must be proved from actual cost records for the specific delay periods. The formula assumes uniform spend, which no project has, and it is routinely rejected — the delay windows here are mid-project, where rates differ substantially from the tail",
           "Use it, but apply a 15% discount to reflect uncertainty",
           "Use it only for the neutral event DE-03"],
     a:1},
    {q:"3. \"You finished 147 days late but you are only claiming 135 days of extension. That inconsistency undermines the whole claim.\"",
     opts:["Increase the claim to 147 days to remove the inconsistency",
           "It is not an inconsistency — it is the correct result. The 74 days of contractor-caused delay in DE-02 and DE-05 partly ran concurrently with, or absorbed float alongside, the excusable events. A claim that exactly equals the total lateness usually means the contractor has not analysed its own delays, and is a weaker document, not a stronger one",
           "Withdraw the claim and resubmit",
           "Argue that the 12-day difference is within measurement tolerance"],
     a:1}
   ],
   why:"Point 1: the 28-day clock runs from awareness of the event or circumstance, and a variation instruction is the event. A general assertion of earlier awareness is not enough — the Engineer must identify what was known and when. Point 2: the preliminaries-divided-by-duration formula is intuitive, common and routinely rejected, because spend is never uniform and the delay windows here sit mid-project where the cost profile differs sharply from the post-completion tail. Actual records for the specific periods are required. Point 3: a claim that exactly matches total lateness is a warning sign, not a virtue. Analysing your own delays honestly and claiming less than the total is what makes the rest of the document credible — and this is the same principle as addressing concurrency openly in the claim structure."}
 ]}
];

/* ========================================================================== *
 *  MASTER CHALLENGE — 30 questions across all four levels, 3 hearts, no reveals
 * ========================================================================== */
var MASTER = [
 {type:"mcq", q:"The critical path is properly defined as:", opts:["The chain with the least total float","The longest continuous path through the network","The chain carrying the most cost","The chain with the most activities"], a:1},
 {type:"calc", q:"Activity K: ES 8, LS 15, duration 4. What is its total float, in days?", a:7, tol:0.01},
 {type:"calc", q:"Activity M finishes at EF 22. Its two successors have ES 25 and ES 31. What is M's free float, in days?", a:3, tol:0.01},
 {type:"mcq", q:"Under the 100% rule, the children of a WBS parent must:", opts:["Be equal in value","Sum to exactly the parent's scope","Number at least four","Each be under 2% of project value"], a:1},
 {type:"mcq", q:"A work package should typically represent what share of total project value?", opts:["0.5% to 2%","2% to 8%","5% to 15%","Under 0.1%"], a:0},
 {type:"calc", q:"3,200 m³ of concrete; one crew places 80 m³/day. The client requires completion in 20 working days. How many crews are needed?", a:2, tol:0.01},
 {type:"mcq", q:"Which relationship pair correctly models a cable crew following a trenching crew along a route?", opts:["FS with a lag","SS alone","SS + FF","FF alone"], a:2},
 {type:"mcq", q:"Leads (negative lags) are prohibited principally because:", opts:["They are difficult to draw","They break the backward pass and produce indefensible float under out-of-sequence updates","P6 does not support them","They always shorten the programme"], a:1},
 {type:"mcq", q:"An activity with no successor will:", opts:["Always be critical","Never appear on the critical path, so genuine delay on it is invisible","Have zero total float","Be flagged as an error and deleted"], a:1},
 {type:"calc", q:"A site works 07:00 to 17:00 with a one-hour unpaid break. How many net working hours per day?", a:9, tol:0.02},
 {type:"mcq", q:"Concrete curing should be placed on:", opts:["The 6-day site calendar","A 7-day continuous calendar","The 5-day engineering calendar","Whichever calendar the predecessor uses"], a:1},
 {type:"mcq", q:"Which is NOT a legitimate reason to change an approved baseline?", opts:["An approved variation adding scope","A granted extension of time","The contractor is 60 days behind","A demonstrable error agreed in writing by both parties"], a:2},
 {type:"mcq", q:"In the two-resource structure, the weightage resource is set up as:", opts:["A Material resource at contract value","A Labour resource with unit price 1.00","A Nonlabour resource at zero cost","An expense line"], a:1},
 {type:"calc", q:"Three activities: budget 500,000 at 100%; budget 1,500,000 at 40%; budget 1,000,000 at 20%. What is the weighted percent complete? Give a percentage to one decimal place.", a:43.3, tol:0.15},
 {type:"mcq", q:"On Physical percent complete type, Primavera P6:", opts:["Auto-calculates actual units from progress","Does not auto-calculate actual units","Calculates progress from remaining duration","Requires a driving resource"], a:1},
 {type:"mcq", q:"Entering physical percent complete on an activity:", opts:["Moves the forecast finish date","Does not move the forecast finish date — only remaining duration does","Recalculates the critical path","Updates the baseline"], a:1},
 {type:"calc", q:"An activity has original duration 50 days. At the data date, 20 days have elapsed and it is 25% complete. At the achieved rate, what remaining duration should be entered, in days?", a:60, tol:1},
 {type:"mcq", q:"Retained logic, compared with progress override, generally produces:", opts:["An earlier finish date","A later finish date","An identical finish date","An undefined result"], a:1},
 {type:"mcq", q:"The peak of the periodic progress histogram should sit:", opts:["In the first quarter","Mid-project, during peak construction","At handover","In the final month"], a:1},
 {type:"mcq", q:"Earned value is:", opts:["The actual cost of work performed","The budgeted cost of work performed","The budgeted cost of work scheduled","The forecast cost at completion"], a:1},
 {type:"calc", q:"BAC 12,000,000; PV 5,000,000; EV 4,200,000; AC 5,250,000. What is CPI, to three decimal places?", a:0.8, tol:0.012},
 {type:"calc", q:"Using the same data — BAC 12,000,000, EV 4,200,000, AC 5,250,000 — what is EAC assuming past cost performance continues? Give the answer in AED.", a:15000000, tol:60000},
 {type:"calc", q:"Same data again. What is TCPI to recover the original budget, to three decimal places?", a:1.156, tol:0.012},
 {type:"mcq", q:"SPI converges to 1.00 as a project approaches completion because:", opts:["Projects always recover at the end","At completion EV = PV = BAC regardless of how late the project is","The formula is inverted near completion","Actual cost stops accruing"], a:1},
 {type:"calc", q:"A 20-month project. At month 15, earned value equals what the baseline planned to earn by month 12. What is IEAC(t), in months?", a:25, tol:0.3},
 {type:"mcq", q:"DCMA test 12 injects 600 days into a critical activity. If the finish date moves by only 200 days, this indicates:", opts:["The programme is efficiently compressed","Something — a constraint, open end or broken chain — is absorbing the impact, so float values cannot be trusted","The critical path is correctly modelled","The calendar is set to 7 days"], a:1},
 {type:"calc", q:"Critical path length is 300 working days and the total float on the driving path is −15 days. What is CPLI, to two decimal places?", a:0.95, tol:0.006},
 {type:"calc", q:"Activity: O = 12, M = 18, P = 36. What is the PERT expected duration te, in days?", a:20, tol:0.02},
 {type:"calc", q:"Two activities in series with standard deviations of 3 and 4 days. What is the standard deviation of the path, in days?", a:5, tol:0.05},
 {type:"mcq", q:"Under genuine concurrency, the usual outcome is:", opts:["Time and money","Time but not money","Money but not time","Neither time nor money"], a:1},
 {type:"mcq", q:"The FIDIC notice period for claims is:", opts:["14 days from impact","28 days from awareness of the event or circumstance","42 days from impact","28 days from the end of the month in which the event occurred"], a:1},
 {type:"mcq", q:"Time Impact Analysis differs from Impacted As-Planned principally because it:", opts:["Uses the programme updated to just before each event, rather than the untouched baseline","Is performed retrospectively","Removes delays rather than inserting them","Requires as-built logic"], a:0},
 {type:"mcq", q:"The most reliable method of proving lost productivity under AACE RP 25R-03 is:", opts:["Total cost","Industry productivity factors","The measured mile","Modified total cost"], a:2},
 {type:"mcq", q:"Ranked by what actually decides claims, the delay analysis method sits:", opts:["First — it is the heart of the claim","Second, behind notice only","Around fifth, behind notice, records, causation and the accepted baseline","Last"], a:2}
];
