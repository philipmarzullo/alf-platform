import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Use Vite's ?url import to get a proper asset path for the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/**
 * Extract text from a File object (PDF, DOCX, or TXT).
 * Returns { text, type, pageCount? }
 */
export async function extractText(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    return extractPdf(file);
  }
  if (name.endsWith('.docx') || name.endsWith('.doc')) {
    return extractDocx(file);
  }
  if (name.endsWith('.txt')) {
    return extractTxt(file);
  }

  return { text: '', type: 'unknown', warning: `Unsupported file type: ${file.name}` };
}

async function extractPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(' ');
    pages.push(text);
  }

  return {
    text: pages.join('\n\n'),
    type: 'pdf',
    pageCount: pdf.numPages,
  };
}

async function extractDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return {
    text: result.value,
    type: 'docx',
  };
}

function extractTxt(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ text: reader.result, type: 'txt' });
    reader.onerror = () => resolve({ text: '', type: 'txt', warning: 'Failed to read text file' });
    reader.readAsText(file);
  });
}
