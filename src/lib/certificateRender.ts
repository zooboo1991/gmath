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

  // Certificate number: small cover over the printed underscores, then redraw.
  page.drawRectangle({ x: 396, y: fromTop(191), width: 66, height: 17, color: WHITE });
  {
    const size = shrinkToFit(boldFont, certificate.certificateNumber, 55, 12);
    drawCentered(page, certificate.certificateNumber, 429, fromTop(187), boldFont, size);
  }

  // Full name, on the blank line under "... СУРАЛЦАГЧ".
  {
    const fullName = `${certificate.lastName} ${certificate.firstName}`;
    const size = shrinkToFit(boldFont, fullName, 400, 20);
    drawCentered(page, fullName, 592.5, fromTop(283), boldFont, size);
  }

  // Category + course line: the template's own gaps are too narrow for real
  // values (some are one or two characters wide), so the whole line is
  // covered and redrawn centered instead of squeezed into the original gaps.
  page.drawRectangle({ x: 410, y: fromTop(397), width: 372, height: 22, color: WHITE });
  {
    const line = `${certificate.category} ангиллын ${certificate.course} курсын агуулга бүхий`;
    const size = shrinkToFit(regularFont, line, 370, 11, 7);
    drawCentered(page, line, 596, fromTop(391), regularFont, size);
  }

  // Date, on the blank line above "ОГНОО".
  {
    const dateText = formatCourseDate(certificate.issuedDate);
    const size = shrinkToFit(regularFont, dateText, 95, 11);
    drawCentered(page, dateText, 504.75, fromTop(519), regularFont, size);
  }

  return pdfDoc.save();
}
