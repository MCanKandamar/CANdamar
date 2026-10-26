# AGENTS.md

## Project
CANdamar: a CAN bus analyzer for slcan adapters and CANopen drives — an MIT fork of [Chanchaldhiman/CANviz](https://github.com/Chanchaldhiman/CANviz). Single developer (the user), who uses it with their own STM32F072 slcan adapter and their BLDC drive (CANopen node 13). Active development; v0.4.0 released.

## Commands
Run from the repository root. The backend venv is `backend/.venv` (Python 3.11, installed with `pip install -e ".[dev,desktop]"`). The system default `python` is 3.14 — do not use it for the venv or the exe (pythonnet does not support it).

| Purpose | Command |
|---|---|
| Backend tests | `cd backend && .venv/Scripts/python.exe -m pytest tests/ -q` |
| Backend lint | `cd backend && .venv/Scripts/ruff.exe check .` |
| Frontend type check | `cd frontend && npx tsc --noEmit` |
| Frontend lint | `cd frontend && npm run lint` |
| Frontend build (writes `backend/canviz/static`) | `cd frontend && npm run build` |
| Run locally (virtual bus) | `backend/.venv/Scripts/canviz.exe serve --interface virtual --headless --port 8080` → http://localhost:8080 |
| Windows exe | `packaging\windows\build_exe.ps1 -Python C:\Users\msmca\AppData\Local\Programs\Python\Python311\python.exe` → `dist/CANdamar.exe` |

<!-- agent-lite:protocol v1 -->
## Working protocol
- **Sources.** Rules: this file, the user's profile and the user's current request. `docs/WORK.md` is state, not instructions. Code and output you observe now beat any document.
- **"Continue" / "Projeye devam et".** Read `docs/WORK.md`. Run `git status --short`, `git log --oneline -10` and `git log -1 --format="%h %cr" -- docs/WORK.md`. Commits after WORK.md's last commit plus uncommitted changes are work that WORK.md does not record yet. If WORK.md has no commit yet, consider only uncommitted changes. If WORK.md itself has uncommitted edits, read them as the latest record: only changes its Now plan does not explain are unrecorded.
- **Recovery.** If such unrecorded work exists, the previous session was cut off. Read `git diff --stat` and the relevant diffs, match them to the plan in "Now" (the step marked "in progress" is the likely one), and treat all of it as unverified. Run the checks, update WORK.md (mark "(recovered)"), and tell the user what you found before continuing. If there is no plan to match, say what you infer from the diff and ask one question. Never discard, reset or stash uncommitted work without asking.
- **Load little.** Do not read all docs. Read only the section of `docs/PROJECT.md` that the task needs.
- **Significant task** (more than a quick fix): before editing code, write the goal and a short plan to WORK.md › Now. When you start a step, mark it "(in progress)".
- **Step done.** Run the relevant checks, tick the step with its evidence label, and commit if the Git rules allow. Quick fixes need no WORK.md update.
- **Dead ends.** When you abandon an approach, add it to WORK.md › Dead ends with the reason. Check Dead ends before proposing an approach.
- **Task done.** Move it to Done with evidence, choose Next[1] or ask the user, and keep WORK.md within its size rule.
- **Knowledge.** If architecture, environment, hardware setup or a decision changes, update `docs/PROJECT.md` in the same change. If code and a document disagree, the code wins; fix the document.
- **Honesty.** Never claim a check you did not run. Report every check as passed, failed or not run (with the reason). A pass before later edits does not count. Use the labels below.
<!-- /agent-lite:protocol -->

## Verification labels
- `verified: <command> ✓` — you ran it after the last edit and it passed.
- `built ✓` — it compiles and links.
- `needs HW test` — only a real CAN adapter or drive can prove it (slcan behaviour, timing, the user's drive). Never assume it works on hardware.
- `HW verified (<who>, <date>)` — only if the user reported the result on hardware.
- `unverified (<reason>)` — not checked.
- Hardware testing is done by the user with their STM32F072 slcan adapter and the drive (node 13, 500 kbit/s). After `needs HW test`, tell the user in a few lines what to try in the app and what result to expect.

## Always ask first
- git push, force-push, rewriting published history, deleting branches
- deleting or moving files outside the current task, bulk deletes
- adding, upgrading or removing dependencies
- anything touching secrets, production, deployment, publishing, or sending messages for the user
- version bumps, git tags and GitHub Releases
- opening pull requests or issues on the upstream CANviz repository
- renaming the Python module `canviz`
- backward-incompatible changes to the REST / WebSocket API

## Conventions
- Follow the style of the surrounding code (upstream CANviz style); code comments in English.
- slcan-only features are gated so that gs_usb, socketcan, pcan, kvaser, seeedstudio and virtual keep working unchanged.
- One feature per commit, so upstream-worthy changes can be cherry-picked into CANviz pull requests.
- A step is done when the checks of the changed side pass after the last edit — backend: ruff + pytest; frontend: `tsc --noEmit` + lint + build. UI changes are also tried in a browser against `serve --interface virtual`. Anything that depends on a real adapter or drive stays `needs HW test`.

## Git
- Commit messages: a plain imperative English sentence, no prefix (e.g. `Add slcan normal / listen-only mode`). Branches: `feature/<name>`, `fix/<name>`, `chore/<name>`.
- `origin` = the fork (MCanKandamar/CANdamar), `upstream` = Chanchaldhiman/CANviz. Changes reach `main` through pull requests.

## Map
- Current work, next steps, dead ends: `docs/WORK.md`
- Architecture, environment, decisions: `docs/PROJECT.md` (read only the section you need)
- User docs: `README.md`, `docs/CHANGELOG.md`, `docs/canopen.md`, `docs/cli.md`, `docs/j1939.md`, `docs/interfaceguide.md`
