import { test } from "node:test";
import assert from "node:assert/strict";
import { isSelectionCommitEvent } from "./selection.ts";
import {
  aiChatShellClassName,
  annotationSidebarClassName,
  mobileAnnotationToggleClassName,
  paperContentFrameClassName,
  paperContentShellClassName,
  paperScrollerClassName,
  selectionPopupLeft,
} from "./responsiveLayout.ts";
import {
  imagePreviewFromAttrs,
  imagePreviewImageClassName,
  imagePreviewOverlayClassName,
  isSecondTap,
} from "./imagePreview.ts";

test("touchend commits a mobile text selection", () => {
  assert.equal(isSelectionCommitEvent("touchend"), true);
  assert.equal(isSelectionCommitEvent("mouseup"), true);
  assert.equal(isSelectionCommitEvent("click"), false);
});

test("mobile AI chat shell is an overlay instead of a right sidebar", () => {
  const mobile = aiChatShellClassName("mobile");
  const desktop = aiChatShellClassName("desktop");

  assert.match(mobile, /fixed/);
  assert.match(mobile, /bottom-0/);
  assert.doesNotMatch(mobile, /w-80/);
  assert.match(desktop, /w-80/);
});

test("collapsed annotations do not leave a mobile sidebar rail", () => {
  const collapsed = annotationSidebarClassName(true);
  const expanded = annotationSidebarClassName(false);

  assert.match(collapsed, /hidden/);
  assert.match(collapsed, /md:flex/);
  assert.doesNotMatch(collapsed, /(^|\s)border-r(\s|$)/);
  assert.match(collapsed, /md:border-r/);
  assert.match(expanded, /fixed/);
  assert.match(expanded, /bottom-0/);
  assert.match(expanded, /md:static/);
  assert.match(mobileAnnotationToggleClassName(), /md:hidden/);
  assert.match(mobileAnnotationToggleClassName(), /fixed/);
});

test("selection popup is clamped inside a narrow mobile container", () => {
  assert.equal(selectionPopupLeft(12, 326, 320, 8), 163);
  assert.equal(selectionPopupLeft(314, 326, 320, 8), 163);
  assert.equal(selectionPopupLeft(180, 500, 320, 8), 180);
});

test("mobile paper reader containers suppress horizontal overflow", () => {
  assert.match(paperScrollerClassName(), /overflow-x-hidden/);
  assert.match(paperScrollerClassName(), /min-w-0/);
  assert.match(paperContentShellClassName(), /max-w-full/);
  assert.match(paperContentShellClassName(), /px-4/);
  assert.match(paperContentFrameClassName(), /overflow-x-hidden/);
});

test("paper image preview uses the image source and fits the viewport", () => {
  assert.deepEqual(imagePreviewFromAttrs("/assets/paper/fig1.png", "", "Figure 1"), {
    src: "/assets/paper/fig1.png",
    alt: "Figure 1",
  });
  assert.equal(imagePreviewFromAttrs("", "", "missing"), null);
  assert.match(imagePreviewOverlayClassName(), /fixed/);
  assert.match(imagePreviewOverlayClassName(), /inset-0/);
  assert.match(imagePreviewImageClassName(), /object-contain/);
  assert.match(imagePreviewImageClassName(), /max-w-\[calc\(100vw-2rem\)\]/);
  assert.match(imagePreviewImageClassName(), /max-h-\[calc\(100dvh-5rem\)\]/);
});

test("mobile image preview opens only on a quick repeated tap on the same image", () => {
  const first = { src: "/fig1.png", at: 1000 };
  assert.equal(isSecondTap(null, first, 320), false);
  assert.equal(isSecondTap(first, { src: "/fig2.png", at: 1200 }, 320), false);
  assert.equal(isSecondTap(first, { src: "/fig1.png", at: 1500 }, 320), false);
  assert.equal(isSecondTap(first, { src: "/fig1.png", at: 1250 }, 320), true);
});
