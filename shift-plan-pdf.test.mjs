import { test } from "node:test";
import assert from "node:assert/strict";
import { createShiftPlanPDF } from "./shift-plan-pdf.js";
import { PERMITS } from "./business-data.js";

test("PDF object offsets, stream length and route annotations are valid", () => {
  const pdf = createShiftPlanPDF({
    place: {
      name: "Hicks Canyon · Southwest Surface Lot 1",
      address: "3864 Viewpark Ave (Irvine)",
      distance: 11,
      source: "OpenStreetMap",
    },
    origin: "Near Irvine (approximate)",
    date: "Oct 10, 2026",
    service: "Weekday / Lunch",
    menu: "Meals",
    orders: "80",
    revenue: "$1,120.00",
    surplus: "$680.00",
    rows: [["Fuel price", "$5.00/gal"]],
    travel: "20 round-trip road miles",
    checks: PERMITS.map(([id, label]) => ({ label, done: id === "health" })),
    approval: "Confirm host permission",
    retrieved: "Oct 10, 2026",
    routes: [
      "https://maps.google.com/?q=Irvine",
      "https://maps.apple.com/?q=Irvine",
    ],
  });
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.ok(pdf.includes("CITYFIT / IRVINE"));
  assert.ok(pdf.includes("$5.00/gal"));
  assert.ok(pdf.includes("\\(Irvine\\)"));
  const xref = Number(pdf.match(/startxref\n(\d+)/)[1]);
  assert.equal(pdf.slice(xref, xref + 4), "xref");
  const entries = pdf.slice(xref).split("\n").slice(3, 11);
  entries.forEach((entry, i) =>
    assert.ok(
      pdf.slice(Number(entry.slice(0, 10))).startsWith(`${i + 1} 0 obj`),
    ),
  );
  const stream = pdf.match(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/);
  assert.equal(Number(stream[1]), stream[2].length);
  assert.equal((pdf.match(/\/Subtype \/Link/g) || []).length, 2);
});
