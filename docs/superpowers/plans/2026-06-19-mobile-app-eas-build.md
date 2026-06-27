# Mobile App EAS Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real Android/iOS mobile app for Paper Commons that avoids mobile browser text-selection UI conflicts and uses GitHub Actions plus Expo EAS Build for cloud compilation.

**Architecture:** Keep the existing Go backend and React web frontend. Add a separate `mobile/` Expo React Native app that consumes the existing API and implements its own mobile reading and annotation interaction instead of relying on browser selection. Use GitHub Actions only as the CI trigger; EAS Build performs Android/iOS cloud compilation and signing.

**Tech Stack:** Expo, React Native, TypeScript, EAS Build, GitHub Actions, existing Go API, existing PaperVersion/DocumentBlock/AnnotationTarget data model.

---

## Context

更新时间：2026-06-19  
信息来源：

- Expo EAS CI: https://docs.expo.dev/build/building-on-ci/
- Expo EAS Build overview: https://docs.expo.dev/build/introduction/
- Expo GitHub builds: https://docs.expo.dev/build/building-from-github/
- Expo programmatic access / `EXPO_TOKEN`: https://docs.expo.dev/accounts/programmatic-access/
- GitHub hosted runners: https://docs.github.com/actions/using-github-hosted-runners/about-github-hosted-runners
- Existing backend architecture: `docs/backend-architecture.md`

Current problem:

- Mobile Safari/Chrome show system or browser text-selection popovers after selecting text.
- Web code cannot reliably suppress those popovers across Android/iOS browsers.
- Existing web selection popup conflicts with browser UI.
- A WebView wrapper would still inherit many text-selection constraints, so it is not the recommended route.

Decision:

- Build a native mobile app shell with Expo React Native.
- Reuse backend APIs and data model.
- Implement a custom reading and annotation layer for mobile.
- Compile Android/iOS through EAS Build triggered by GitHub Actions, so the server does not need Android SDK or Xcode.

## File Structure

Planned new files:

- `docs/mobile-app-plan.md`  
  Product-facing plan summary for future reference.

- `mobile/package.json`  
  Mobile app dependencies and scripts.

- `mobile/app.json` or `mobile/app.config.ts`  
  Expo app metadata, bundle identifiers, runtime settings.

- `mobile/eas.json`  
  EAS build profiles for Android APK preview and iOS internal/TestFlight builds.

- `mobile/tsconfig.json`  
  TypeScript config.

- `mobile/src/api/client.ts`  
  Typed HTTP client for existing Go API.

- `mobile/src/api/types.ts`  
  Shared frontend-facing types mirroring `Paper`, `ReaderPayload`, `DocumentBlock`, `Annotation`, and `AnnotationTarget`.

- `mobile/src/features/library/LibraryScreen.tsx`  
  Paper list and loading/error/empty states.

- `mobile/src/features/reader/ReaderScreen.tsx`  
  Mobile reading entry screen.

- `mobile/src/features/reader/BlockRenderer.tsx`  
  Renders structured blocks from `readerPayload.blocks`.

- `mobile/src/features/reader/MobileSelectionLayer.tsx`  
  Custom mobile selection state and handles; no browser/native text-selection dependency.

- `mobile/src/features/reader/AnnotationToolbar.tsx`  
  Bottom toolbar for highlight, underline, note, and AI actions.

- `mobile/src/features/reader/NotesSheet.tsx`  
  Notes/highlights bottom sheet.

- `mobile/src/features/chat/ChatSheet.tsx`  
  Mobile AI chat sheet backed by existing chat API.

- `mobile/src/state/readerStore.ts`  
  Local reader UI state: active paper, selected block range, selected annotation, pending note.

- `.github/workflows/mobile-eas-build.yml`  
  GitHub Actions workflow that installs dependencies and triggers EAS cloud builds.

Planned modified files:

- `README.md` or project root docs index if one is added later  
  Link to mobile setup instructions.

- `docs/backend-architecture.md`  
  Add a short note that the mobile app is a second client of the Go API.

## Milestones

### Milestone 1: Planning and API Contract

Outcome: mobile app scope is clear before scaffolding.

- [ ] **Step 1: Write product-facing plan**

Create `docs/mobile-app-plan.md` with:

```markdown
# Mobile App Plan

更新时间：2026-06-19

## Goal

Build a real Android/iOS mobile app for Paper Commons reading, annotation, notes, and AI chat. The app avoids browser-native text selection conflicts by using a custom mobile reading interaction.

## Non-goals

- Do not ship a WebView wrapper as the primary mobile app.
- Do not replace the existing web frontend.
- Do not replace the existing Go backend.
- Do not build offline sync in the first milestone.

## MVP

- Paper list
- Reader payload loading
- Structured block rendering
- Image preview
- Notes/highlights sheet
- Custom selection mode over blocks
- Highlight, underline, note creation
- AI chat using existing backend
- Android APK preview build from EAS

## Later

- iOS TestFlight
- Offline cache
- Better character-level selection handles
- Push notifications
- App-store release automation
```

- [ ] **Step 2: Document existing API contract**

Add a section to `docs/mobile-app-plan.md`:

```markdown
## API Reuse

The mobile app consumes the same Go API used by the web frontend:

- `GET /api/papers`
- `GET /api/papers/{paperID}/reader`
- `GET /api/papers/{paperID}/annotations`
- `POST /api/annotations`
- `PATCH /api/annotations/{annotationID}`
- `DELETE /api/annotations/{annotationID}`
- `POST /api/chat/sessions`
- `GET /api/chat/sessions?paper_id={paperID}`
- `GET /api/chat/sessions/{sessionID}/messages`
- `POST /api/chat/sessions/{sessionID}/messages`

The mobile app must preserve `AnnotationTarget` fields: `block_id`, `start_offset`, `end_offset`, `quote_exact`, `quote_prefix`, `quote_suffix`, `page_idx`, `rects`, `selector`, and `meta`.
```

- [ ] **Step 3: Commit planning docs**

Run:

```bash
git add docs/mobile-app-plan.md docs/superpowers/plans/2026-06-19-mobile-app-eas-build.md
git commit -m "docs: plan mobile app eas build"
```

Expected: commit succeeds if this repository is initialized as git. If the workspace has no `.git`, skip commit and report that the files were written.

### Milestone 2: Scaffold Expo App

Outcome: `mobile/` exists and can run TypeScript checks locally or in CI.

- [ ] **Step 1: Create Expo app**

Run from repo root:

```bash
npx create-expo-app@latest mobile --template blank-typescript
```

Expected: `mobile/package.json`, `mobile/app.json`, and TypeScript source files are created.

- [ ] **Step 2: Add scripts**

Modify `mobile/package.json` scripts to include:

```json
{
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd mobile
npm run typecheck
```

Expected: TypeScript exits with code 0.

- [ ] **Step 4: Commit scaffold**

Run:

```bash
git add mobile
git commit -m "feat: scaffold mobile expo app"
```

### Milestone 3: Add API Client

Outcome: mobile app can call the existing Go backend with typed responses.

- [ ] **Step 1: Create `mobile/src/api/types.ts`**

Create types matching the existing frontend-facing model:

```ts
export interface Paper {
  id: string;
  title: string;
  authors?: string;
  abstract?: string;
  venue?: string;
  year?: string;
  status?: string;
  active_version_id?: string;
}

export interface DocumentBlock {
  id: string;
  paper_version_id: string;
  block_order: number;
  section_path?: string[];
  type: string;
  level?: number;
  page_idx?: number;
  html?: string;
  markdown?: string;
  canonical_text?: string;
  display_text?: string;
  meta?: Record<string, unknown>;
}

export interface AnnotationTarget {
  id?: string;
  annotation_id?: string;
  block_id: string;
  start_offset: number;
  end_offset: number;
  quote_exact: string;
  quote_prefix?: string;
  quote_suffix?: string;
  page_idx?: number;
  rects?: Array<{ page_idx: number; x: number; y: number; width: number; height: number }>;
  selector?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface Annotation {
  id: string;
  paper_id?: string;
  paperId?: string;
  paper_version_id?: string;
  type: "highlight" | "underline" | "note";
  color: string;
  body?: string;
  note?: string;
  translation?: string;
  selectedText?: string;
  targets?: AnnotationTarget[];
}

export interface ReaderPayload {
  paper: Paper;
  version: Record<string, unknown>;
  toc: Array<{ title: string; block_id?: string; blockID?: string; level: number; order?: number }>;
  chunks: Array<Record<string, unknown>>;
  blocks: DocumentBlock[];
  annotations: Annotation[];
  targets: AnnotationTarget[];
}
```

- [ ] **Step 2: Create `mobile/src/api/client.ts`**

```ts
import type { Annotation, AnnotationTarget, Paper, ReaderPayload } from "./types";

const DEFAULT_BASE_URL = "http://localhost:4000";

export function apiBaseURL(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_BASE_URL;
}

export async function requestJSON<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseURL()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export function listPapers(): Promise<{ papers: Paper[] }> {
  return requestJSON<{ papers: Paper[] }>("/api/papers");
}

export function readerPayload(paperID: string): Promise<ReaderPayload> {
  return requestJSON<ReaderPayload>(`/api/papers/${paperID}/reader`);
}

export function createAnnotation(input: {
  paper_id: string;
  paper_version_id: string;
  type: "highlight" | "underline" | "note";
  color: string;
  body: string;
  targets: AnnotationTarget[];
}): Promise<{ annotation: Annotation; targets: AnnotationTarget[] }> {
  return requestJSON<{ annotation: Annotation; targets: AnnotationTarget[] }>("/api/annotations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
```

- [ ] **Step 3: Add API client test**

If the scaffold includes Jest, test `apiBaseURL()` with `EXPO_PUBLIC_API_BASE_URL`. If not, defer automated API tests until a test runner is added and rely on typecheck for this milestone.

- [ ] **Step 4: Run typecheck**

```bash
cd mobile
npm run typecheck
```

Expected: exit code 0.

### Milestone 4: Library and Reader MVP

Outcome: mobile app can list papers and render a paper in a mobile-friendly reader.

- [ ] **Step 1: Build `LibraryScreen`**

Create `mobile/src/features/library/LibraryScreen.tsx` with:

- Loading state.
- Empty state.
- Error state with retry.
- Paper list cards.
- `onOpenPaper(paperID)` callback.

- [ ] **Step 2: Build `ReaderScreen`**

Create `mobile/src/features/reader/ReaderScreen.tsx` with:

- Reader payload loading.
- Back button.
- Title area.
- Scrollable blocks.
- Notes/highlights button.
- AI button.

- [ ] **Step 3: Build `BlockRenderer`**

Create `mobile/src/features/reader/BlockRenderer.tsx` with initial support:

- `heading`
- `paragraph`
- `list`
- `image`
- `caption`
- fallback text block

Implementation rule: do not render arbitrary HTML with a WebView for the main reading flow. Use `canonical_text`, `display_text`, `meta.asset_refs`, and sanitized plain rendering first.

- [ ] **Step 4: Wire navigation**

Use a small local state in `mobile/App.tsx` first:

```ts
type Route =
  | { name: "library" }
  | { name: "reader"; paperID: string };
```

No router dependency is required for MVP.

- [ ] **Step 5: Run typecheck**

```bash
cd mobile
npm run typecheck
```

Expected: exit code 0.

### Milestone 5: Custom Mobile Annotation Interaction

Outcome: mobile annotation no longer depends on browser-native text selection.

- [ ] **Step 1: Define selection state**

Create `mobile/src/state/readerStore.ts`:

```ts
import type { DocumentBlock } from "../api/types";

export interface MobileSelection {
  blockID: string;
  quoteExact: string;
  startOffset: number;
  endOffset: number;
}

export function selectWholeBlock(block: DocumentBlock): MobileSelection | null {
  const text = (block.canonical_text || block.display_text || "").trim();
  if (!text) return null;
  return {
    blockID: block.id,
    quoteExact: text,
    startOffset: 0,
    endOffset: text.length,
  };
}
```

- [ ] **Step 2: Add selection mode to block renderer**

In `BlockRenderer`, long press on a paragraph-like block should call:

```ts
onSelectBlock(block)
```

MVP behavior: select the full block. This is less precise than character selection, but reliable and avoids system selection popovers.

- [ ] **Step 3: Add `AnnotationToolbar`**

Create `mobile/src/features/reader/AnnotationToolbar.tsx`:

- Fixed bottom bar.
- Buttons: highlight, underline, note, ask AI, cancel.
- Buttons operate on `MobileSelection`.

- [ ] **Step 4: Save annotation**

Use existing API:

```ts
createAnnotation({
  paper_id: paper.id,
  paper_version_id: String(payload.version.id),
  type: "highlight",
  color: "#FEF08A",
  body: "",
  targets: [{
    block_id: selection.blockID,
    start_offset: selection.startOffset,
    end_offset: selection.endOffset,
    quote_exact: selection.quoteExact,
    quote_prefix: "",
    quote_suffix: "",
    page_idx: 0,
    rects: [],
    selector: { mobile_selection: "block-v1" },
    meta: { source: "mobile" },
  }],
});
```

- [ ] **Step 5: Add note modal/sheet**

For note creation, open a bottom sheet with:

- Selected quote preview.
- Text area.
- Save button.
- Cancel button.

- [ ] **Step 6: Run typecheck**

```bash
cd mobile
npm run typecheck
```

Expected: exit code 0.

### Milestone 6: AI Chat and Notes Sheet

Outcome: mobile app supports existing reading-side workflows.

- [ ] **Step 1: Create `NotesSheet`**

Show annotations for the current paper:

- Type indicator.
- Selected text.
- Note body.
- Tap item scrolls to block if possible.

- [ ] **Step 2: Create `ChatSheet`**

Use existing chat API:

- Create session if none exists.
- Send selected text as context.
- Display user/assistant messages.

- [ ] **Step 3: Add loading/error states**

Every network action must show one of:

- Loading state.
- Disabled save/send button.
- Error message with retry.

- [ ] **Step 4: Run typecheck**

```bash
cd mobile
npm run typecheck
```

Expected: exit code 0.

### Milestone 7: EAS Build Configuration

Outcome: app can be built in EAS cloud.

- [ ] **Step 1: Configure Expo app metadata**

Set stable app identifiers:

```json
{
  "expo": {
    "name": "Paper Commons",
    "slug": "paper-commons",
    "scheme": "papercommons",
    "ios": {
      "bundleIdentifier": "com.papercommons.mobile"
    },
    "android": {
      "package": "com.papercommons.mobile"
    }
  }
}
```

- [ ] **Step 2: Create `mobile/eas.json`**

```json
{
  "cli": {
    "version": ">= 20.2.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "android": {
        "buildType": "apk"
      },
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Step 3: Run EAS configure**

Run locally on a developer machine or CI environment with Expo auth:

```bash
cd mobile
npx eas-cli build:configure
```

Expected: EAS project is linked and `eas.json` remains valid.

- [ ] **Step 4: Create first Android preview build**

```bash
cd mobile
npx eas-cli build --platform android --profile preview
```

Expected: EAS produces an APK download URL.

### Milestone 8: GitHub Actions Build Trigger

Outcome: GitHub can trigger EAS cloud builds without requiring the project server to compile mobile binaries.

- [ ] **Step 1: Create Expo token**

Create an Expo access token from Expo account settings.

Repository secret:

```text
EXPO_TOKEN=<expo access token>
```

- [ ] **Step 2: Create `.github/workflows/mobile-eas-build.yml`**

```yaml
name: Mobile EAS Build

on:
  workflow_dispatch:
    inputs:
      platform:
        description: "Platform to build"
        required: true
        default: "android"
        type: choice
        options:
          - android
          - ios
          - all
      profile:
        description: "EAS build profile"
        required: true
        default: "preview"
        type: choice
        options:
          - development
          - preview
          - production

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mobile
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: mobile/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Setup Expo and EAS
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Build Android
        if: ${{ github.event.inputs.platform == 'android' || github.event.inputs.platform == 'all' }}
        run: eas build --platform android --profile ${{ github.event.inputs.profile }} --non-interactive

      - name: Build iOS
        if: ${{ github.event.inputs.platform == 'ios' || github.event.inputs.platform == 'all' }}
        run: eas build --platform ios --profile ${{ github.event.inputs.profile }} --non-interactive
```

- [ ] **Step 3: Run workflow manually**

From GitHub Actions:

- Select `Mobile EAS Build`.
- Choose `platform=android`.
- Choose `profile=preview`.
- Run workflow.

Expected: workflow passes typecheck and EAS creates an Android APK build.

- [ ] **Step 4: Commit CI config**

```bash
git add .github/workflows/mobile-eas-build.yml mobile/eas.json mobile/app.json
git commit -m "ci: add mobile eas build workflow"
```

### Milestone 9: iOS Readiness

Outcome: iOS path is explicit before spending time on Apple signing.

- [ ] **Step 1: Confirm Apple Developer account**

Requirement:

- Apple Developer Program membership.
- App bundle identifier available: `com.papercommons.mobile`.

- [ ] **Step 2: Run iOS internal build through EAS**

```bash
cd mobile
npx eas-cli build --platform ios --profile preview
```

Expected: EAS asks for or uses configured iOS credentials.

- [ ] **Step 3: Decide distribution path**

Choose one:

- TestFlight for broader testing.
- Ad Hoc for limited registered devices.
- Development build for internal debugging.

Record the choice in `docs/mobile-app-plan.md`.

## Acceptance Criteria

MVP is acceptable when:

- Android APK can be built from GitHub Actions through EAS.
- App opens on Android and loads papers from the existing Go backend.
- Reader displays structured blocks.
- Mobile annotation creation does not trigger browser text-selection UI.
- Highlight/note annotations persist through existing `/api/annotations`.
- Notes sheet shows saved annotations.
- AI chat can send selected text to existing chat API.
- iOS build path is documented, with Apple account requirement explicitly called out.

## Risks

- Expo/EAS requires an Expo account and `EXPO_TOKEN` for CI.
- iOS builds require Apple Developer credentials.
- Full character-level custom selection is harder than block-level selection; MVP should start with full block or sentence-level selection.
- React Native cannot safely render arbitrary paper HTML the same way a browser can. The reader should use structured blocks and plain text first, then add safe renderers for images, tables, formulas, and captions.
- Offline support is intentionally out of MVP.

## Execution Order

Recommended order:

1. Milestone 1: planning and API contract.
2. Milestone 2: Expo scaffold.
3. Milestone 3: API client.
4. Milestone 4: library and reader.
5. Milestone 5: custom annotation interaction.
6. Milestone 8: GitHub Actions Android preview build.
7. Milestone 6: AI chat and notes sheet.
8. Milestone 7: refine EAS profiles.
9. Milestone 9: iOS readiness.

Android preview build should come before iOS because APK testing is faster and does not require Apple signing.

