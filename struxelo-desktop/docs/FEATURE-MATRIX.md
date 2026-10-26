# Feature matrix

This is a capability inventory, not a parity percentage. “Implemented” means a limited independent workflow exists; it does not mean equivalence to SYNCHRO has been established.

Vendor baseline: [official feature overview](https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0017688), [guide](https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0017466) and [schedule imports](https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0017484).

| Capability | Struxelo 0.1.0 | Boundary / missing work |
| --- | --- | --- |
| Schedule authoring | Implemented subset | Flat edits; no complete planning engine |
| P6 XML import | Partial | 95 sample activities; three unresolved links retained |
| MSP XML import | Partial | 118 non-root sample tasks; calendars/constraints omitted |
| Other schedule integration | Missing | No Asta, Safran, NetPoint or two-way sync |
| CPM calculation | Partial | Flat FS network; calendar-day approximation |
| Baseline dates | Implemented subset | One date snapshot; no historical revisions |
| Activity filtering/sorting | Implemented subset | Text search, date/ID/source order |
| Multi-format geometry | Partial | Embedded GLB; no native CAD or SP decoder |
| Model updates | Partial | Replace whole model; assignments reset |
| Primitive geometry | Demo only | No interactive authoring tools |
| Construction subdivision | Missing | No geometry splitting or quantity takeoff |
| Manual linking | Partial | One task per part |
| Automatic linking | Partial | Unique code-substring preview |
| Resource planning | Missing | No full hierarchy, leveling or equipment allocation |
| Sequence playback | Implemented subset | Whole-day dates and three rates |
| Appearance simulation | Partial | Standard status colors; no full appearance profiles |
| Progress recording | Partial | Entered task percentage; no resource status history |
| Cost / earned value | Partial | Entered costs and physical-percent EV |
| Spatial analysis | Approximation | Active AABB screen, not solid clash detection |
| Reports/export | Partial | Task CSV and viewport PNG |
| Animation/rendering | Missing | No video, camera paths or Iray |
| Custom fields/formulas | Missing | No formula or script language |
| Cloud collaboration | Missing | Local single-user project only |
| Field / modeler integration | Missing | No mobile or cloud product equivalent |
| Windows distribution | Packaged prototype | Unsigned; requires native acceptance testing |

Full feature accuracy and 100% parity remain **unverified and unmet**. There is no defensible completion percentage without an agreed version-specific capability inventory and observed comparisons.

Review-informed additions—guided onboarding, readable date stepping, local recovery and previewed matching—are design decisions for Struxelo. They do not establish that the reference application lacks those features.
