const clean = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, " ");
const escape = (value) => clean(value).replace(/([\\()])/g, "\\$1");

export function createShiftPlanPDF(plan) {
  const ink = "0.12 0.20 0.23",
    teal = "0.13 0.43 0.39",
    muted = "0.38 0.44 0.47";
  const commands = [];
  const rect = (x, y, w, h, color) =>
    commands.push(`${color} rg ${x} ${792 - y - h} ${w} ${h} re f`);
  const text = (value, x, y, size = 10, bold = false, color = ink) =>
    commands.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg 1 0 0 1 ${x} ${792 - y - size} Tm (${escape(value)}) Tj ET`,
    );
  const wrap = (value, x, y, width = 520, size = 10, bold = false) => {
    const max = Math.floor(width / (size * 0.56));
    const lines = [];
    let line = "";
    for (const word of clean(value).split(/\s+/)) {
      if ((line + " " + word).trim().length > max && line) {
        lines.push(line);
        line = "";
      }
      line += (line ? " " : "") + word;
    }
    if (line) lines.push(line);
    for (const [i, row] of lines.entries())
      text(row, x, y + i * (size + 4), size, bold);
    return y + lines.length * (size + 4);
  };
  const section = (label, y) => {
    text(label, 40, y, 10, true, teal);
    rect(40, y + 19, 532, 1, "0.86 0.90 0.88");
  };
  rect(0, 0, 612, 792, "1 1 1");
  rect(0, 0, 612, 112, teal);
  text("CITYFIT / IRVINE", 40, 25, 10, true, "0.83 0.94 0.83");
  text("Your Shift Plan", 40, 46, 29, true, "1 1 1");
  text(plan.service, 40, 88, 10, false, "1 1 1");
  text(plan.date, 455, 26, 9, false, "1 1 1");
  let y = wrap(plan.place.name, 40, 130, 530, 17, true);
  y = wrap(plan.place.address, 40, y + 5, 530, 10);
  y = wrap(
    `From ${plan.origin} | ${plan.place.distance.toFixed(1)} straight-line miles | ${plan.menu}`,
    40,
    y + 5,
    530,
    10,
  );
  y += 15;
  for (const [i, metric] of [
    ["EXPECTED ORDERS", plan.orders],
    ["REVENUE", plan.revenue],
    ["MONEY LEFT", plan.surplus],
  ].entries()) {
    const x = 40 + i * 181;
    rect(x, y, 170, 65, i === 2 ? "0.89 0.95 0.89" : "0.95 0.97 0.96");
    text(metric[0], x + 12, y + 11, 8, true, muted);
    text(metric[1], x + 12, y + 29, 23, true, teal);
  }
  y += 84;
  section("SALES & COSTS", y);
  y += 29;
  for (const [label, value] of plan.rows) {
    text(label, 40, y, 10);
    text(value, 405, y, 10, true);
    y += 20;
  }
  y = wrap(plan.travel, 40, y + 3, 530, 9);
  y += 12;
  section("BEFORE YOU SERVE", y);
  y += 29;
  for (const item of plan.checks) {
    rect(40, y + 3, 6, 6, item.done ? teal : "0.79 0.82 0.81");
    y =
      wrap(
        `${item.done ? "Recorded" : "Pending"}: ${item.label}`,
        54,
        y,
        515,
        9,
      ) + 3;
  }
  y = wrap(plan.approval, 40, y + 5, 530, 9);
  y = wrap(
    `Source: ${plan.place.source} | Retrieved ${plan.retrieved}`,
    40,
    y + 6,
    530,
    8,
  );
  const routeY = Math.min(y + 14, 724);
  text("Google Route", 40, routeY, 10, true, teal);
  rect(40, routeY + 22, 532, 1, "0.86 0.90 0.88");
  text(
    "Estimate based on your inputs. Confirm host permission and truck access.",
    40,
    routeY + 31,
    8,
    false,
    muted,
  );
  text(
    "Excludes labor, booking, parking and other overhead; before income tax.",
    40,
    routeY + 44,
    8,
    false,
    muted,
  );
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R /Annots [${plan.routes.map((_, i) => `${7 + i} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ...plan.routes.map(
      (url, i) =>
        `<< /Type /Annot /Subtype /Link /Rect [${40 + i * 125} ${792 - routeY - 14} ${150 + i * 125} ${792 - routeY}] /Border [0 0 0] /A << /S /URI /URI (${escape(url)}) >> >>`,
    ),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return pdf;
}
