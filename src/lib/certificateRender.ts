import fs from "fs";
import path from "path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Certificate } from "./db";
import { formatCourseDate } from "./courseDate";

const TEMPLATE_PATH = path.join(process.cwd(), "src/assets/certificates/template.pdf");
const FONT_REGULAR_PATH = path.join(process.cwd(), "src/assets/fonts/Nunito-Regular.ttf");
const FONT_EXTRABOLD_PATH = path.join(process.cwd(), "src/assets/fonts/Nunito-ExtraBold.ttf");

const PAGE_HEIGHT = 595;
const INK = rgb(0.067, 0.09, 0.157);
const WHITE = rgb(1, 1, 1);

/** The template's y-axis runs top-down; pdf-lib draws from the bottom. */
function fromTop(y: number): number {
  return PAGE_HEIGHT - y;
}

/** Backs off font size until `text` fits `maxWidth`, so real (longer) data never overlaps the template's fixed art. */
function shrinkToFit(font: PDFFont, text: string, maxWidth: number, startSize: number, minSize = 6): number {
  let size = startSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

function drawCentered(
  page: PDFPage,
  text: string,
  centerX: number,
  baselineY: number,
  font: PDFFont,
  size: number
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: centerX - width / 2, y: baselineY, size, font, color: INK });
}

// The template's own 5-line paragraph, minus the category/course line, which
// is rebuilt per certificate. Kept verbatim (including the curly quotes) so
// the redraw reads identically to the original artwork.
const PARAGRAPH_LINE_1 = "Та Монгол улсын математикийн олимпиадын";
const PARAGRAPH_LINE_2 = "Дархан аварга Б.Ганбат багшийн зохион байгуулсан";
const PARAGRAPH_LINE_4 = "“Математикийн олимпиадын сургалт”-д амжилттай";
const PARAGRAPH_LINE_5 = "хамрагдсан тул энэхүү батламжаар баталгаажуулав.";
const PARAGRAPH_CENTER_X = 596;
const PARAGRAPH_MAX_WIDTH = 370;
const PARAGRAPH_BODY_SIZE = 12;

/**
 * Overlays a certificate's data onto the admin-supplied template (measured
 * directly off src/assets/certificates/template.pdf, an 842x595pt landscape
 * page). If that file is ever replaced with a differently laid-out design,
 * every coordinate below needs re-measuring against the new one.
 */
export async function renderCertificatePdf(certificate: Certificate): Promise<Uint8Array> {
  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);

  const regularFont = await pdfDoc.embedFont(fs.readFileSync(FONT_REGULAR_PATH));
  const boldFont = await pdfDoc.embedFont(fs.readFileSync(FONT_EXTRABOLD_PATH));

  const page = pdfDoc.getPages()[0];

  // Certificate number: same weight and size as the surrounding sentence, not
  // bold — it reads as part of "<number> дугаартай энэхүү батламжийг ...".
  page.drawRectangle({ x: 396, y: fromTop(191), width: 66, height: 17, color: WHITE });
  {
    const size = shrinkToFit(regularFont, certificate.certificateNumber, 55, PARAGRAPH_BODY_SIZE);
    drawCentered(page, certificate.certificateNumber, 429, fromTop(187), regularFont, size);
  }

  // Full name, on the blank line under "... СУРАЛЦАГЧ".
  {
    const fullName = `${certificate.lastName} ${certificate.firstName}`;
    const size = shrinkToFit(boldFont, fullName, 400, 20);
    drawCentered(page, fullName, 592.5, fromTop(283), boldFont, size);
  }

  // The whole 5-line paragraph is covered and redrawn at one shared size,
  // rather than leaving the template's own ~14pt lines next to a shrunk-to-fit
  // category/course line — a visible size mismatch otherwise. The size is
  // capped at 12pt and only drops below that if the (usually longest)
  // category/course line can't fit, so every line still matches.
  page.drawRectangle({ x: 410, y: fromTop(434), width: 372, height: 102, color: WHITE });
  {
    const dynamicLine = `${certificate.category} ангиллын ${certificate.course} курсын агуулга бүхий`;
    const lines = [PARAGRAPH_LINE_1, PARAGRAPH_LINE_2, dynamicLine, PARAGRAPH_LINE_4, PARAGRAPH_LINE_5];
    const size = Math.min(
      ...lines.map((line) => shrinkToFit(regularFont, line, PARAGRAPH_MAX_WIDTH, PARAGRAPH_BODY_SIZE, 7))
    );
    const lineY = [340.4, 359.4, 378.4, 397.4, 416.4].map((top) => fromTop(top + 10));
    lines.forEach((line, i) => drawCentered(page, line, PARAGRAPH_CENTER_X, lineY[i], regularFont, size));
  }

  // Date, on the blank line above "ОГНОО" — lifted to sit level with the
  // signature image next to it rather than hugging the line underneath it.
  {
    const dateText = formatCourseDate(certificate.issuedDate);
    const size = shrinkToFit(regularFont, dateText, 95, PARAGRAPH_BODY_SIZE);
    drawCentered(page, dateText, 504.75, fromTop(505), regularFont, size);
  }

  return pdfDoc.save();
}
