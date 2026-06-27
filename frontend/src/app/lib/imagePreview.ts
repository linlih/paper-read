export interface ImagePreviewSource {
  src: string;
  alt: string;
}

export interface ImageTap {
  src: string;
  at: number;
}

export function imagePreviewFromAttrs(currentSrc: string | undefined, src: string | undefined, alt: string | undefined): ImagePreviewSource | null {
  const imageSrc = (currentSrc || src || "").trim();
  if (!imageSrc) return null;
  return {
    src: imageSrc,
    alt: (alt || "").trim() || "论文图片",
  };
}

export function isSecondTap(previous: ImageTap | null, current: ImageTap, maxDelayMs = 320): boolean {
  if (!previous) return false;
  return previous.src === current.src && current.at - previous.at > 0 && current.at - previous.at <= maxDelayMs;
}

export function imagePreviewOverlayClassName(): string {
  return "fixed inset-0 z-50 flex items-center justify-center bg-[#1E1C1A]/85 p-4 overflow-hidden";
}

export function imagePreviewImageClassName(): string {
  return "max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-5rem)] object-contain rounded-md bg-white shadow-2xl";
}
