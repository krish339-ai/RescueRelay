# Maintaining the RescueRelay documentation

Author: Krishna Kallamadi

## Files and ownership of facts

- `project-plan.json` is the factual status source for twelve baseline stages and five separately scoped optional AI stages. Update it only from accepted milestone evidence, then run `python docs/generate_project_plan.py` to regenerate `project-plan.html`.
- `build-guide.html` is a self-contained, editable HTML guide. It needs no bundler, CDN, external font, or documentation server. Open it directly in a browser.
- `generate_project_doc.py` generates `RescueRelay-Project-Documentation.docx`. Edit the source generator before regenerating so future versions preserve the change.
- `ai-service-decisions.json` records all 17 service roles and implementation/activation boundaries. Run `python docs/service_matrix.py` and `python docs/generate_project_plan.py` after changing it to refresh both HTML matrices.
- `evidence.json` records primary-source context, dates, and boundaries. Historical operating examples are not live route data or demonstrations of a recovered incident.
- `api-contract.md` describes the supported client contract. Compare it with `apps/api/src/app.ts` and `packages/shared/src/index.ts` after API changes.
- `ai-api-contract.md` describes the optional integration boundary. Compare it with `packages/shared/src/ai.ts` and `apps/api/src/ai/`; a declared contract is not proof of a passed test or live service.
- `verification.md` records executed release checks. Update it only from observed command output and inspected client behavior.
- `implementation-plan.md` records the build sequence and acceptance gates. It is not evidence that every target was tested.

## Optional DOCX toolchain

Running the application requires Node, not Python. Python is needed only if you want to regenerate the Word document. The generator was authored and checked with Python 3.12 and python-docx 1.2.0.

From the repository root, a typical macOS or Linux setup is:

```sh
python3 -m venv .venv-docs
.venv-docs/bin/python -m pip install -r docs/requirements-docs.txt
.venv-docs/bin/python docs/generate_project_doc.py
```

For Windows PowerShell, use your installed Python interpreter:

```powershell
py -3 -m venv .venv-docs
.\.venv-docs\Scripts\python.exe -m pip install -r docs/requirements-docs.txt
.\.venv-docs\Scripts\python.exe docs/generate_project_doc.py
```

These are local regeneration instructions; they are not a claim that the document toolchain was tested on every operating system. Keep `.venv-docs` out of version control. An alternate output is supported with `--output path/to/file.docx`.

## Review before committing

1. Read the changed implementation, contract, and executed test output. Separate source compatibility, bundle export, native runtime testing, signing, and distribution.
2. Update both the HTML guide and DOCX generator when a change affects the workflow, safety boundary, setup commands, or supported platforms.
3. Run `python docs/check_documentation.py` to check required files, local links, and author metadata. Then regenerate the DOCX. Open it in Word or LibreOffice and export a PDF for layout review. Inspect every page for clipping, broken tables, missing glyphs, inconsistent headings, and unintended blank pages. Export alone is not review.
4. Review HTML in a desktop and a narrow phone-width viewport. Verify navigation anchors, code readability, keyboard focus, table scrolling, and local companion-file links. Do not infer app behavior from documentation screenshots.
5. Check names, author links, dates, source URLs, and privacy labels. Keep demonstration cases clearly synthetic and preserve the boundary between published examples and hypothetical disruptions.
6. Preserve only the requested final documentation and source files. Temporary render images and PDFs belong under `docs/.qa/`, which is ignored. Never commit credentials, local database files, or real personal records.

The current Pipeline-update DOCX has 20 pages, including the Windows launcher guidance. It was rendered with the shared document renderer and all 20 page images were inspected on 30 October 2026 at 21:13 UTC; no clipping, broken tables or unintended blank pages were found. Render evidence is retained under `docs/.qa/pipeline-published-final/`. Its canonical service names, roles and statuses are checked against the service matrix. The HTML was reviewed through a local managed preview at a desktop width and a 390-pixel phone-layout viewport. Current artifact-specific review results are retained in the ignored QA directory; later edits require fresh review.

Final optional-AI HTML review passed at a desktop viewport of 1182 CSS pixels. A fresh narrow-window retest could not be completed because the supported browser tooling did not resize the controlled tab and then lost its accessibility provider. Historical narrow-layout checks remain historical evidence, not a new final pass. Later document edits still require fresh review.

## Current release checkpoint

The 7 November 2026 local-AI update expands the DOCX to 24 pages. Sections 21–24 document configuration, provider-specific test coverage, Pinecone and LangSmith setup, and demo-account validation boundaries. The generator and HTML guide were updated together. The standard renderer could not run because LibreOffice was unavailable; Microsoft Word exported the review PDF, and bundled PDFium rendered all 24 pages for visual inspection. All pages were checked without clipping, broken tables or unintended blank pages. Evidence is retained under `docs/.qa/ai-setup-update/`. The HTML content and links were updated, but this revision has not received a fresh desktop/mobile browser layout review. Earlier 20-page review records below remain historical.

The 17 accepted stages retain their historical evidence. `project-plan.json` separates the newer redesign in `current_release`; update its outstanding gates from observed results without resetting earlier completed work or attributing historical CI to new code. The current DOCX must be rendered and every page reviewed before delivery. Keep the original failed aggregate verification and successful single-worker export retry distinct.

Final publication-evidence rerender remained 20 pages. Changed pages 1 and 20 were visually re-inspected; pages 2–19 were byte-identical PNGs to the fully inspected earlier render. No new layout defect was observed. The current implementation checkpoint is verified; documentation publication and attachment receipt remain separate facts.
