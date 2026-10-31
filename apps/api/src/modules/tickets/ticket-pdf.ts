import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);
const DISPLAY_FONT =
  require.resolve('@fontsource/big-shoulders/files/big-shoulders-latin-800-normal.woff');

const PAPER = '#FAF7F2';
const INK = '#1A1714';
const INK_MUTED = '#6B645C';
const LINE = '#D9D2C7';
const ACCENT = '#F59E0B';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 300;
const MARGIN = 32;
const STUB_WIDTH = 190;

export interface PrintableTicket {
  code: string;
  reference: string;
  eventTitle: string;
  venue: string;
  when: string;
  tierName: string;
  seatLabel: string | null;
  holderName: string;
}

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });
}

function drawTicket(doc: PDFKit.PDFDocument, ticket: PrintableTicket, qr: Buffer) {
  const stubX = PAGE_WIDTH - STUB_WIDTH;
  const bodyWidth = stubX - MARGIN * 2;

  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(PAPER);
  doc.rect(0, 0, 8, PAGE_HEIGHT).fill(ACCENT);

  doc
    .fillColor(INK_MUTED)
    .font('Courier')
    .fontSize(9)
    .text(`${ticket.when}  ·  ${ticket.venue}`.toUpperCase(), MARGIN, MARGIN, { width: bodyWidth });

  doc
    .fillColor(INK)
    .font('Display')
    .fontSize(34)
    .text(ticket.eventTitle.toUpperCase(), MARGIN, MARGIN + 22, {
      width: bodyWidth,
      lineGap: -6,
      height: 110,
      ellipsis: true,
    });

  const detailsY = PAGE_HEIGHT - MARGIN - 82;
  const detail = (label: string, value: string, x: number, width: number) => {
    doc
      .fillColor(INK_MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(label.toUpperCase(), x, detailsY, { width });
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(value, x, detailsY + 12, { width });
  };
  detail('Ticket', ticket.tierName, MARGIN, bodyWidth / 2);
  detail('Seat', ticket.seatLabel ?? 'General admission', MARGIN + bodyWidth / 2, bodyWidth / 2);

  doc
    .fillColor(INK_MUTED)
    .font('Helvetica')
    .fontSize(9)
    .text(`Admits ${ticket.holderName}`, MARGIN, PAGE_HEIGHT - MARGIN - 18, { width: bodyWidth });

  doc
    .moveTo(stubX, 12)
    .lineTo(stubX, PAGE_HEIGHT - 12)
    .dash(4, { space: 4 })
    .lineWidth(1)
    .stroke(LINE)
    .undash();
  doc.circle(stubX, 0, 10).fill('#FFFFFF');
  doc.circle(stubX, PAGE_HEIGHT, 10).fill('#FFFFFF');

  const qrSize = STUB_WIDTH - MARGIN * 2;
  doc.rect(stubX + MARGIN - 6, MARGIN + 14, qrSize + 12, qrSize + 12).fill('#FFFFFF');
  doc.image(qr, stubX + MARGIN, MARGIN + 20, { width: qrSize, height: qrSize });

  doc
    .fillColor(INK_MUTED)
    .font('Courier')
    .fontSize(9)
    .text(ticket.reference, stubX + MARGIN, MARGIN + qrSize + 34, {
      width: qrSize,
      align: 'center',
    });
}

export async function renderTicketsPdf(tickets: readonly PrintableTicket[]): Promise<Buffer> {
  const doc = new PDFDocument({
    size: [PAGE_WIDTH, PAGE_HEIGHT],
    margin: 0,
    autoFirstPage: false,
    info: { Title: tickets[0]?.eventTitle ?? 'FestPass tickets', Author: 'FestPass' },
  });
  doc.registerFont('Display', DISPLAY_FONT);
  const output = collect(doc);

  for (const ticket of tickets) {
    const qr = await QRCode.toBuffer(ticket.code, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 360,
    });
    doc.addPage();
    drawTicket(doc, ticket, qr);
  }

  doc.end();
  return output;
}
