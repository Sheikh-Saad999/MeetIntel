// Reading uploaded files. PDFs and images go to Gemini (which can read scans); Word, Excel and plain
// text files are read locally.
import mammoth from "mammoth";
import ExcelJS from "exceljs";

export const MAX_TEXT = 60000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function kindOf(name = "", mime = "") {
  const ext = String(name).toLowerCase().split(".").pop();
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "xlsx") return "xlsx";
  if (ext === "csv") return "csv";
  if (ext === "txt" || ext === "md") return "text";
  if (["png", "jpg", "jpeg"].includes(ext)) return "image";
  return null;
}

const cell = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cell(v.result);          // formula: use the calculated value
    if ("text" in v) return String(v.text);             // hyperlink
    if ("error" in v) return String(v.error);
    return "";
  }
  return String(v);
};

async function xlsxToText(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const out = [];
  wb.worksheets.slice(0, 6).forEach((ws) => {
    out.push(`## Sheet: ${ws.name}`);
    let rows = 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (rows++ >= 300) return;
      const cells = row.values.slice(1, 21).map(cell);   // row.values is 1-based
      if (cells.some((c) => c.trim())) out.push(cells.join(" | "));
    });
    if (rows > 300) out.push(`(… ${rows - 300} more rows not shown)`);
  });
  return out.join("\n");
}

/** Text of docx / xlsx / csv / txt / md files. Returns "" for kinds that need Gemini (pdf, image). */
export async function extractLocal(kind, buffer) {
  let text = "";
  if (kind === "docx") text = (await mammoth.extractRawText({ buffer })).value;
  else if (kind === "xlsx") text = await xlsxToText(buffer);
  else if (kind === "csv" || kind === "text") text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT);
}
