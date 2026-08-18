"use client";

import { PDFDocument } from "pdf-lib";

/**
 * Shrinking a lesson-notes PDF in the browser, before it is uploaded.
 *
 * A scanned or photographed set of solved problems routinely leaves the
 * scanner app at 20–40 MB — a page of handwriting stored as a full-resolution
 * photo. Students open these on phone data, so the file is re-rendered: each
 * page is drawn to a canvas at print-legible density, encoded as JPEG, and
 * reassembled into a new PDF at the same page size.
 *
 * The trade-off is deliberate and one-way: whatever was text becomes an image,
 * so it can no longer be selected and stops being crisp under heavy zoom. That
 * is why this only runs over a threshold — a PDF that is already small is left
 * exactly as it was — and why the result is discarded if it came out bigger,
 * which happens with pages that were already efficiently compressed.
 *
 * pdfjs is imported dynamically: it is ~1 MB of JavaScript that only the
 * teacher's lesson editor ever needs, and it must not land in a student's
 * bundle.
 */

/** Files under this are uploaded untouched — see the note about text above. */
export const SHRINK_THRESHOLD_BYTES = 3_000_000;

/** Refused outright. Well past anything a lesson's notes should be. */
export const MAX_NOTE_BYTES = 50 * 1024 * 1024;

/**
 * Target rendering density. 150 dpi keeps handwriting and formula subscripts
 * readable on paper and on a phone; 300 would double the size for detail
 * nobody looks at in a lesson note.
 */
const TARGET_DPI = 150;
/** PDF user space is 72 units per inch, which is what pdfjs `scale: 1` means. */
const PDF_DPI = 72;
const JPEG_QUALITY = 0.75;

export type ShrinkResult = {
  file: File;
  /** Bytes before and after, for telling the teacher what happened. */
  before: number;
  after: number;
  pages: number;
  /** False when the original was kept — already small, or shrinking made it worse. */
  changed: boolean;
};

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** `%PDF-` — checked because a wrong file picked by mistake should fail here, not on a student's screen. */
export async function looksLikePdf(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === "%PDF-";
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas_encode_failed"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

export async function shrinkPdf(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<ShrinkResult> {
  const before = file.size;
  if (before <= SHRINK_THRESHOLD_BYTES) {
    return { file, before, after: before, pages: 0, changed: false };
  }

  const pdfjs = await import("pdfjs-dist");
  // Bundled alongside the app rather than fetched from a CDN: the page's CSP
  // allows no external script hosts, and a worker that fails to load makes
  // pdfjs fall back to rendering on the main thread and freezing the tab.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const bytes = new Uint8Array(await file.arrayBuffer());
  // A copy, because pdfjs takes ownership of the buffer it is handed and
  // pdf-lib would then be reading a detached one.
  // The loading task, not just the document: `destroy()` lives on the task and
  // is what shuts the worker down again.
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const source = await task.promise;
  const out = await PDFDocument.create();
  const scale = TARGET_DPI / PDF_DPI;

  try {
    for (let i = 1; i <= source.numPages; i += 1) {
      onProgress?.(i, source.numPages);
      const page = await source.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas_unavailable");
      // Scanned pages often have no background of their own; without this the
      // JPEG would come out on black.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      // `intent: "print"` matters for more than fidelity. Under the default
      // "display" intent pdfjs drives its render loop with
      // requestAnimationFrame, which a browser stops firing in a hidden tab —
      // so a teacher who switched tabs while a 30 MB scan was being processed
      // would come back to a progress counter frozen on page 1, forever. The
      // print intent renders straight through, and rasterising for a file is
      // what we are doing anyway.
      await page.render({ canvas, viewport, intent: "print" }).promise;
      const jpeg = await canvasToJpeg(canvas);
      const embedded = await out.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));

      // The page keeps its original size in points, so paper printing and page
      // numbering come out the same as the original.
      const original = page.getViewport({ scale: 1 });
      const newPage = out.addPage([original.width, original.height]);
      newPage.drawImage(embedded, { x: 0, y: 0, width: original.width, height: original.height });

      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await task.destroy();
  }

  const saved = await out.save();
  const shrunk = new File([saved as BlobPart], file.name.replace(/\.pdf$/i, "") + ".pdf", {
    type: "application/pdf",
  });

  if (shrunk.size >= before) {
    return { file, before, after: before, pages: source.numPages, changed: false };
  }
  return { file: shrunk, before, after: shrunk.size, pages: source.numPages, changed: true };
}
