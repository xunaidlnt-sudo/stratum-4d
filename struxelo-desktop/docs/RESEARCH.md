# Research log and evidence

Research date: **26 October 2026**. Product direction: **Junaid Quamar**.

## Method

Separate three kinds of evidence:

1. **Documented:** a vendor page describes a feature.
2. **Observed:** a downloaded artifact was inspected or an implemented workflow was exercised.
3. **Unverified:** a behavior has not been compared against the reference desktop program.

No public document is treated as proof of implementation details, exact algorithms or complete parity. Struxelo is independently implemented; it does not contain recovered SYNCHRO source code.

## Software acquisition

[Bentley's release index](https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0017467) lists 2026 releases including 6.5.11 and 6.5.10. The linked 6.5.11 article redirected to authentication in the research tool. The [6.5.10 announcement](https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0051415) was readable and links to the official [SYNCHRO download portal](https://softwaredownloads.bentley.com/en/ProductDetails/3035).

The download portal exposed a JavaScript loading shell, not a direct installer. Bentley's [getting-started instructions](https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0115213) direct users to sign into CONNECT and obtain download access. Its [trial page](https://www.bentley.com/en/products/synchro-4d/synchro-4d-free-trial/) uses a request-and-eligibility process. No account was created, no representative contacted and no proprietary installer was obtained.

Therefore a specific SYNCHRO executable version is not an observed baseline. Features in general documentation may differ across desktop releases, cloud offerings and license bundles.

## REA installation and execution

REA source: https://github.com/morluto/rea  
Commit: `0211a07ec5c43b2f8cbdbcd80f3f3619773a7b72`  
Package: 6.8.0; Node: 24.22.1; npm: 11.16.0.

The source build succeeded. A production stdio adapter test initialized the server, listed 229 tools and six prompts, matched package/catalog identity, and completed a target-free `binary_session` request. This checks the adapter, not an active chat registration or native decompiler availability.

## Public training material

Bentley's [Training / Challenge Models page](https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0017475) exposed a downloadable [training ZIP](https://bentleysystems.service-now.com/sys_attachment.do?sys_id=3ce231aa473d0a1088c56642846d4360).

Archive SHA-256:

```text
40f5135cc898bc1d6892e11d9007954b836f8e879519c8cf0f77f11891aad749
```

REA `inspect-artifact` inventoried 16 files and three directories. Files include P6/MSP XML schedules, 3D DWF/DWFX assets and two SP projects. Complete evidence and the summary are under `research/evidence/`. The original inventory recorded the project's earlier working-directory name, `/workspace/veydris-4d`; files were subsequently moved to `/workspace/struxelo-4d`. Original evidence bytes were preserved.

The MSP sample contains 119 task elements; Struxelo imports 118 after excluding the UID 0 root. The P6 sample has 95 activities and 158 relationship elements. Static XML examination found three links with absent endpoints. Struxelo retains those records explicitly and reports that only 155 relationships were resolved.

REA also inventoried `Structure.dwfx` as an archive. This establishes container entries, not geometry semantics. REA rejected `SYNCHRO Training Building Completed.sp` with `unsupported_target` / `file_format_rejected`; the error is retained as `sp-inspection.json`. No SP decoder was inferred from the filename or binary prefix.

## Documentation baseline

- [Official feature overview](https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0017688): model/schedule/resource workflows, baseline comparison, costs, simulations and collaboration.
- [SYNCHRO 4D Pro guide](https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0017466): workflow topics and links to detailed help.
- [Importing schedules](https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0017484): schedule product and format context.
- [Auto Matching](https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0017478): attribute-based resource/task matching and preview/apply workflow.
- [System requirements](https://bentleysystems.service-now.com/community?id=kb_article&sysparm_article=KB0017458): Windows x64 reference-product requirements.

The feature matrix links requirements to these sources. Documentation-derived rows remain unverified until tested against an exact reference build.

## What would establish parity

Obtain an authorized SYNCHRO executable, record its exact version and hashes, and build paired fixtures for schedules, calendars, constraints, model IDs, resources, appearance profiles, progress and costs. Compare imports, recalculated dates, values, visible geometry and exports under the same inputs. Record numerical tolerances and rendering differences. Expand the coverage ledger for each supported capability and retain failures; a visually similar screen is not evidence of semantic equivalence.
