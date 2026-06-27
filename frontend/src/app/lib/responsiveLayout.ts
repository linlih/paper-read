export type ViewportKind = 'mobile' | 'desktop';

export function aiChatShellClassName(viewport: ViewportKind): string {
  if (viewport === 'mobile') {
    return 'fixed inset-x-0 bottom-0 z-50 h-[82dvh] rounded-t-2xl border-t border-[#1E1C1A]/10 bg-[#FDFAF6] shadow-2xl overflow-hidden';
  }
  return 'hidden md:flex w-80 shrink-0 border-l border-[#1E1C1A]/10 flex-col overflow-hidden';
}

export function annotationSidebarClassName(collapsed: boolean): string {
  const base = 'shrink-0 flex flex-col bg-[#FDFAF6] transition-all duration-200 overflow-hidden';
  if (collapsed) {
    return `${base} hidden md:flex md:w-9 md:border-r md:border-[#1E1C1A]/10`;
  }
  return `${base} fixed inset-x-0 bottom-0 z-50 h-[72dvh] w-full max-w-full rounded-t-2xl border-t border-[#1E1C1A]/10 shadow-2xl md:static md:z-auto md:h-auto md:w-56 md:rounded-none md:border-t-0 md:border-r md:shadow-none md:border-[#1E1C1A]/10`;
}

export function mobileAnnotationToggleClassName(): string {
  return 'md:hidden fixed left-3 bottom-3 z-30 flex items-center gap-1.5 rounded-full bg-[#1E1C1A] px-3 py-2 text-xs text-[#F7F3EE] shadow-lg';
}

export function selectionPopupLeft(x: number, containerWidth: number, popupWidth = 320, edgePadding = 8): number {
  const usableWidth = Math.max(0, containerWidth - edgePadding * 2);
  const effectiveWidth = Math.min(popupWidth, usableWidth);
  const halfWidth = effectiveWidth / 2;
  const minLeft = edgePadding + halfWidth;
  const maxLeft = Math.max(minLeft, containerWidth - edgePadding - halfWidth);
  return Math.min(Math.max(x, minLeft), maxLeft);
}

export function paperScrollerClassName(): string {
  return 'flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden';
}

export function paperContentShellClassName(): string {
  return 'w-full max-w-full md:max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10 relative overflow-x-hidden';
}

export function paperContentFrameClassName(): string {
  return 'relative min-w-0 max-w-full overflow-x-hidden pr-0 md:pr-10';
}
