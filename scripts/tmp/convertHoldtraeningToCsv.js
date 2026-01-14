const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, '..', '..', 'data', 'holdtraening-source.txt');
const outputPath = path.join(__dirname, '..', '..', 'data', 'holdtraening.csv');

function normalizeCategoryPath(category) {
  if (!category) {
    return 'holdtraening_missing';
  }

  const overrides = {
    'Holdtræning': 'holdtraening_root',
    'Fælles (alle positioner)': 'holdtraening_faelles',
    'Målmand': 'holdtraening_maalmand',
    'Back': 'holdtraening_back',
    'Midterforsvarer': 'holdtraening_midterforsvarer',
    'Central midtbane (6/8)': 'holdtraening_central_midtbane',
    'Offensiv midtbane (10)': 'holdtraening_offensiv_midtbane',
    'Kant': 'holdtraening_kant',
    'Angriber': 'holdtraening_angriber',
  };

  if (overrides[category]) {
    return overrides[category];
  }

  const sanitized = category
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return sanitized ? `holdtraening_${sanitized}` : 'holdtraening_missing';
}

function parseCsv(raw) {
  const lines = raw.split(/\r?\n/);
  let category = null;
  const rows = [];
  const warnings = [];

  const isEntryLine = value => /^(.*?)\s+—\s+([★☆]{5})$/.test(value);

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('📁')) {
      const folderName = trimmed.replace(/^📁\s*/, '').trim();
      const namePart = folderName.split('—')[0].trim();
      category = namePart || null;
      continue;
    }

    const entryMatch = trimmed.match(/^(.*?)\s+—\s+([★☆]{5})$/);
    if (!entryMatch) {
      continue;
    }

    const focusArea = entryMatch[1].trim();
    const stars = entryMatch[2];
    const ratingValue = (stars.match(/★/g) || []).length;

    let effectiveCategory = category;
    if (!effectiveCategory) {
      warnings.push(`Missing category for "${focusArea}" (line ${i + 1})`);
      effectiveCategory = 'MISSING';
    }

    const howTo = [];
    const why = [];
    let mode = null;

    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const rawLine = lines[j];
      const inner = rawLine.trim();

      if (!inner) {
        continue;
      }

      if (inner.startsWith('📁') || isEntryLine(inner)) {
        break;
      }

      const lower = inner.toLowerCase();
      if (lower.startsWith('sådan gør du')) {
        mode = 'how_to';
        continue;
      }

      if (lower.startsWith('hvorfor værdifuldt')) {
        mode = 'why';
        continue;
      }

      if (!mode) {
        continue;
      }

      const content = inner.replace(/^-\s*/, '').trim();
      if (!content) {
        continue;
      }

      if (mode === 'how_to') {
        howTo.push(content);
      } else if (mode === 'why') {
        why.push(content);
      }
    }

    if (!howTo.length) {
      warnings.push(`Missing "Sådan gør du" for "${focusArea}" (line ${i + 1})`);
    }

    if (!why.length) {
      warnings.push(`Missing "Hvorfor værdifuldt" for "${focusArea}" (line ${i + 1})`);
    }

    rows.push({
      focus_area: focusArea,
      category_path: normalizeCategoryPath(effectiveCategory),
      star_rating: ratingValue,
      how_to: howTo,
      why: why.join('\n'),
    });

    i = j - 1;
  }

  return { rows, warnings };
}

function toCsv(rows) {
  const header = 'focus_area,category_path,star_rating,how_to,why';
  const body = rows.map(row => [
    row.focus_area,
    row.category_path,
    row.star_rating,
    JSON.stringify(row.how_to || []),
    row.why || '',
  ]
    .map(value => {
      const needsQuotes = /[",\n]/.test(String(value));
      const escaped = String(value).replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    })
    .join(',')
  );
  return [header, ...body].join('\n');
}

const sourceContent = fs.readFileSync(sourcePath, 'utf8');
const raw = sourceContent;
const { rows, warnings } = parseCsv(raw);

const categoryCounts = rows.reduce((acc, row) => {
  acc[row.category_path] = (acc[row.category_path] || 0) + 1;
  return acc;
}, {});

const csv = toCsv(rows);

if (warnings.length) {
  console.warn(`\nWARNINGS (${warnings.length})`);
  warnings.forEach(message => console.warn(` - ${message}`));
  process.exit(1);
}

fs.writeFileSync(outputPath, csv);

console.log('\nCategory counts:');
Object.entries(categoryCounts).forEach(([k, v]) => console.log(` - ${k}: ${v}`));
console.log(` - Total: ${rows.length}`);
console.log(`\nGenerated ${rows.length} rows -> ${outputPath}`);
