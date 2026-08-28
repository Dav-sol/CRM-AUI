// Parser: specs/Biblioteca/biblioteca.md -> prisma/templates-seed.json
// Extrae las plantillas de la biblioteca de copy (50 bases × 3 tonos).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(
  join(here, "../../../../specs/Biblioteca/biblioteca.md"),
  "utf8",
);

const ANGLES = {
  Tranquilidad: "CALM",
  Confianza: "TRUST",
  Prevención: "PREVENTION",
  Recompra: "REPURCHASE",
  Fidelización: "LOYALTY",
  Conversación: "CONVERSATION",
};

const TONES = {
  "Cercano profesional": "PROFESSIONAL",
  "Comercial caribeño": "CARIBE_COMMERCIAL",
  "Caribe auténtico": "CARIBE_AUTHENTIC",
};

// Solo la sección "# Plantillas" en adelante.
const content = md.split("\n# Plantillas\n")[1] ?? "";

// Grupos por categoría comercial.
const categoryRe = /^## Categoría \d+: (.+)$/gm;
const categoryRanges = [];
for (const match of content.matchAll(categoryRe)) {
  categoryRanges.push({
    name: match[1].trim(),
    start: match.index,
  });
}
for (let i = 0; i < categoryRanges.length; i++) {
  categoryRanges[i].end =
    i + 1 < categoryRanges.length
      ? categoryRanges[i + 1].start
      : content.length;
}

const entryRe =
  /^### ([A-Z]{2}-\d{3}) · (.+)$/;
const toneRe = /^#### Tono: (.+)$/gm;

const templates = [];

for (const cat of categoryRanges) {
  const section = content.slice(cat.start, cat.end);
  const entries = [];
  for (const line of section.split("\n")) {
    const m = line.match(entryRe);
    if (m) entries.push({ code: m[1], name: m[2].trim(), index: null });
  }
  // Localizar cada entrada dentro de la sección.
  let cursor = 0;
  for (const entry of entries) {
    const idx = section.indexOf(`### ${entry.code} ·`, cursor);
    entry.index = idx;
    cursor = idx + 1;
  }
  for (let e = 0; e < entries.length; e++) {
    const start = entries[e].index;
    const end = e + 1 < entries.length ? entries[e + 1].index : section.length;
    const chunk = section.slice(start, end);

    // Metadatos de la tabla.
    const meta = {};
    for (const row of chunk.matchAll(/^\| \*\*(.+?)\*\*\s*\| (.+?) \|$/gm)) {
      meta[row[1].trim()] = row[2].trim();
    }

    // Cuerpos por tono.
    const bodies = {};
    const marks = [];
    for (const m of chunk.matchAll(toneRe)) {
      marks.push({ label: m[1].trim(), start: m.index + m[0].length });
    }
    for (let t = 0; t < marks.length; t++) {
      const stop =
        t + 1 < marks.length ? marks[t + 1].start : chunk.length;
      let body = chunk.slice(marks[t].start, stop);
      // Cortar en separadores de entrada o fin.
      const cut = body.search(/\n---\s*\n?$|\n### |\n## /);
      if (cut >= 0) body = body.slice(0, cut);
      // El corte por siguiente tono deja el encabezado `#### Tono: …`.
      body = body.replace(/\n?#{3,4} Tono:.+\s*$/, "").trim();
      bodies[TONES[marks[t].label]] = body;
    }

    const angleName = (meta["Ángulo"] ?? "").trim();
    const angle = ANGLES[angleName];

    for (const [tone, body] of Object.entries(bodies)) {
      templates.push({
        code: entries[e].code,
        name: entries[e].name,
        group: cat.name,
        category: "CAMPAIGN",
        tone,
        angle,
        goal: meta["Objetivo"] ?? null,
        recommendedUse: meta["Uso recomendado"] ?? null,
        body,
        _angleRaw: angleName,
      });
    }
  }
}

// Verificación.
const codes = new Set(templates.map((t) => t.code));
const missingAngle = templates.filter((t) => !t.angle);
const incompleteBodies = new Set();
for (const t of templates) {
  if (!t.body || t.body.length < 10) incompleteBodies.add(t.code);
}

console.log(`Piezas: ${templates.length}`);
console.log(`Plantillas base (códigos): ${codes.size}`);
console.log(`Ángulos sin mapear: ${missingAngle.length}`);
console.log(`Bodies sospechosos: ${[...incompleteBodies].join(", ") || "ninguno"}`);

if (missingAngle.length > 0 || incompleteBodies.size > 0) {
  console.error("Parser incompleto; revisar antes de sembrar.");
  process.exit(1);
}

const clean = templates.map(({ _angleRaw, ...rest }) => rest);
writeFileSync(
  join(here, "../templates-seed.json"),
  `${JSON.stringify(clean, null, 2)}\n`,
);
console.log("OK -> prisma/templates-seed.json");
