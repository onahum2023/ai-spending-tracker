// Loaded on demand (dynamic import) so pdf.js only downloads when a PDF is dropped.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfTextItem } from './revolut';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Extracts positioned text from every page. Runs entirely in the browser. */
export async function pdfTextItems(data: ArrayBuffer): Promise<PdfTextItem[]> {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
  const items: PdfTextItem[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      for (const it of content.items) {
        if ('str' in it && it.str.trim()) items.push({ page: p, x: it.transform[4], y: it.transform[5], str: it.str });
      }
    }
  } finally {
    await doc.destroy();
  }
  return items;
}
