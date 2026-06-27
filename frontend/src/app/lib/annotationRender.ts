import type { Annotation } from '../components/types';

export function applyAnnotationToBlockHTML(html: string, blockText: string, annotations: Annotation[]): string {
  let result = html;
  for (const ann of annotations) {
    const target = ann.targets?.[0];
    const quote = target?.quote_exact || ann.selectedText;
    if (!quote) continue;
    const escaped = quote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const replacement = ann.type === 'underline'
      ? `<span class="paper-annotation paper-annotation-underline" style="border-bottom-color:${ann.color}" data-ann-id="${ann.id}">${quote}</span>`
      : ann.type === 'highlight'
        ? `<mark class="paper-annotation paper-annotation-highlight" style="background:${ann.color}" data-ann-id="${ann.id}">${quote}</mark>`
        : `<span class="paper-annotation paper-annotation-note" data-ann-id="${ann.id}">${quote}</span>`;
    result = result.replace(new RegExp(escaped), replacement);
  }
  return result || blockText;
}
