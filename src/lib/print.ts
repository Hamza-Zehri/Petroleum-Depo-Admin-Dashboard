// Printing and export helpers. RTL + Nastaliq font are embedded so printed
// receipts/reports render correctly regardless of the host environment.
import { currentLang, currentT } from "./lang";

const FONT_URL = "/fonts/NotoNastaliqUrdu.ttf";

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function printCss(isEn: boolean): string {
  const dir = isEn ? "ltr" : "rtl";
  const align = isEn ? "left" : "right";
  const bodyFont = isEn ? "Arial,Helvetica,sans-serif" : '"Noori Nastaleeq","Noto Nastaliq Urdu",serif';
  return `
  @font-face{font-family:"Noori Nastaleeq";src:url("${FONT_URL}") format("truetype");font-display:swap;font-weight:400 700}
  *{box-sizing:border-box}
  html,body{direction:${dir};text-align:${align};margin:0;padding:0}
  body{font-family:${bodyFont};color:#0b2235;padding:24px;line-height:${isEn ? 1.5 : 2}}
  h1,h2,h3{margin:0 0 6px}
  .num,.latin{direction:ltr;font-family:Arial,sans-serif;unicode-bidi:embed}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
  th,td{border:1px solid #cdd6dc;padding:6px 8px;text-align:${align}}
  th{background:#f1f5f7}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #08795c;padding-bottom:10px;margin-bottom:14px}
  .muted{color:#60717f;font-size:12px}
  .total{font-weight:700}
  @media print{.no-print{display:none}}
`;
}

/** Open a print window with the given body HTML and trigger the print dialog. */
export function printHtml(title: string, bodyHtml: string): void {
  const isEn = currentLang() === "en";
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    alert(currentT().popupBlocked);
    return;
  }
  w.document.write(`<!doctype html><html lang="${isEn ? "en" : "ur"}" dir="${isEn ? "ltr" : "rtl"}"><head><meta charset="utf-8"/>
    <title>${escapeHtml(title)}</title><style>${printCss(isEn)}</style></head>
    <body>${bodyHtml}
    <script>
      (function(){function go(){window.focus();window.print();}
      if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){setTimeout(go,120);});}
      else{setTimeout(go,300);}})();
    <\/script></body></html>`);
  w.document.close();
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

export function exportCsv<T>(filename: string, cols: CsvColumn<T>[], rows: T[]): void {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.map((c) => esc(c.header)).join(",");
  const body = rows.map((r) => cols.map((c) => esc(c.value(r))).join(",")).join("\n");
  // BOM so Excel opens Urdu text correctly.
  const blob = new Blob(["\ufeff" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** A4 report header used by all printable reports. */
export function reportHeader(depot: { name: string; contact?: string; address?: string }, title: string, subtitle?: string): string {
  return `<div class="head">
    <div><h1>${escapeHtml(depot.name || currentT().fallbackDepot)}</h1>
      <div class="muted">${escapeHtml(depot.address ?? "")}</div>
      <div class="muted">${escapeHtml(depot.contact ?? "")}</div></div>
    <div style="text-align:left"><h2>${escapeHtml(title)}</h2>
      <div class="muted">${escapeHtml(subtitle ?? "")}</div>
      <div class="muted">${new Date().toLocaleString("en-GB")}</div></div>
  </div>`;
}
