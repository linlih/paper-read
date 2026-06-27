export interface SelectionTarget {
  block_id: string;
  start_offset: number;
  end_offset: number;
  quote_exact: string;
  quote_prefix: string;
  quote_suffix: string;
  selector: Record<string, unknown>;
}

export function resolveSelectionTarget(
  capturedTarget: SelectionTarget | null | undefined,
  readCurrentTarget: () => SelectionTarget | null,
): SelectionTarget | null {
  return capturedTarget || readCurrentTarget();
}

export function isSelectionCommitEvent(eventType: string): boolean {
  return eventType === 'mouseup' || eventType === 'touchend' || eventType === 'selectionchange';
}

export function selectionToTarget(root: HTMLElement): SelectionTarget | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const block = (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer as HTMLElement
    : range.commonAncestorContainer.parentElement
  )?.closest('[data-block-id]') as HTMLElement | null;
  if (!block || !root.contains(block)) return null;
  const quote = selection.toString().trim();
  if (quote.length < 1) return null;
  const text = block.textContent || '';
  const start = text.indexOf(quote);
  if (start < 0) return null;
  const end = start + quote.length;
  return {
    block_id: block.dataset.blockId || '',
    start_offset: start,
    end_offset: end,
    quote_exact: quote,
    quote_prefix: text.slice(Math.max(0, start - 40), start),
    quote_suffix: text.slice(end, end + 40),
    selector: { source: 'html-block-text', strategy: 'block-text-index' },
  };
}
