#!/usr/bin/env node
/*
 * beerxml-convert.js — round-trips wiki recipe pages (housekeeping/Templates/Recipe-Template.md)
 * against BeerXML 1.0 <RECIPE> records. Zero dependencies (plain Node).
 *
 * Usage:
 *   node beerxml-convert.js to-xml <recipe.md> [out.xml]
 *   node beerxml-convert.js to-md  <recipe.xml> [out.md]
 *
 * See ../BeerXML-Mapping.md for the full field mapping and ../Tools/beerxml-README.md for usage notes.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const WIKI_ROOT = path.resolve(__dirname, '..', '..');

// ---------- generic helpers ----------

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function xmlUnescape(s) {
  return String(s == null ? '' : s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function tag(name, value) {
  if (value === undefined || value === null || value === '') return `<${name}></${name}>`;
  return `<${name}>${xmlEscape(value)}</${name}>`;
}

function boolYesNo(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'keg' || s === 'forced' ? 'TRUE' : 'FALSE';
}

// ---------- markdown -> structured recipe ----------

function parseFrontmatter(md) {
  // Tolerates an optional leading "# Title" line before the frontmatter block.
  const m = md.match(/^(?:#[^\n]*\n+)?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: md };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!mm) continue;
    let val = mm[2].trim();
    // strip inline comments (# ...) that aren't inside quotes
    if (!val.startsWith('"') && !val.startsWith("'")) {
      val = val.replace(/\s+#.*$/, '').trim();
    }
    val = val.replace(/^["']|["']$/g, '');
    fm[mm[1]] = val;
  }
  return { fm, body: md.slice(m[0].length) };
}

function parseTable(body, header) {
  const idx = body.indexOf(header);
  if (idx === -1) return [];
  const rest = body.slice(idx + header.length);
  const lines = rest.split(/\r?\n/);
  const rows = [];
  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      if (started) break;
      continue;
    }
    const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c) || c === '')) {
      if (cells.some((c) => /^:?-+:?$/.test(c))) { started = true; }
      continue;
    }
    if (!started) { started = true; continue; } // header row
    if (cells.some((c) => c !== '')) rows.push(cells);
  }
  return rows;
}

function parseSectionText(body, header, nextHeaderRegex) {
  const idx = body.indexOf(header);
  if (idx === -1) return '';
  const rest = body.slice(idx + header.length);
  const nm = rest.match(nextHeaderRegex);
  const chunk = nm ? rest.slice(0, nm.index) : rest;
  return chunk.replace(/<!--[\s\S]*?-->/g, '').trim();
}

function resolveStylePage(wikilink) {
  if (!wikilink) return null;
  const name = wikilink.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
  const base = path.basename(name);
  const fileName = base.endsWith('.md') ? base : `${base}.md`;

  const stack = [WIKI_ROOT];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name === fileName) return full;
    }
  }
  return null;
}

function parseStyleStats(styleFilePath) {
  const out = { name: path.basename(styleFilePath, '.md').replace(/-/g, ' '), category: '', categoryNumber: '' };
  const folder = path.basename(path.dirname(styleFilePath));
  const fm = folder.match(/^([0-9A-Za-z]+)-style-(.+)$/);
  if (fm) {
    out.categoryNumber = fm[1];
    out.category = fm[2].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const text = fs.readFileSync(styleFilePath, 'utf8');
  const statBlock = text.match(/## Vital Statistics\s*\n([\s\S]*?)(\n##|$)/);
  if (statBlock) {
    const grab = (label) => {
      const m = statBlock[1].match(new RegExp(label + ':\\s*([0-9.]+)\\s*[\\u2013-]\\s*([0-9.]+)'));
      return m ? [m[1], m[2]] : [null, null];
    };
    [out.ogMin, out.ogMax] = grab('OG');
    [out.ibuMin, out.ibuMax] = grab('IBUs');
    [out.fgMin, out.fgMax] = grab('FG');
    [out.srmMin, out.srmMax] = grab('SRM');
    const abv = statBlock[1].match(/ABV:\s*([0-9.]+)\s*[–-]\s*([0-9.]+)%/);
    if (abv) { out.abvMin = abv[1]; out.abvMax = abv[2]; }
  }
  return out;
}

function mdToRecord(mdPath) {
  const raw = fs.readFileSync(mdPath, 'utf8');
  const { fm, body } = parseFrontmatter(raw);
  const nameMatch = raw.match(/^#\s+(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : path.basename(mdPath, '.md').replace(/-/g, ' ');

  const fermentables = parseTable(body, '## Fermentables').map((c) => ({
    name: c[0], amount: c[1], type: c[2], yield: c[3], color: c[4], addAfterBoil: c[5],
  }));
  const hops = parseTable(body, '## Hops').map((c) => ({
    name: c[0], amount: c[1], alpha: c[2], use: c[3], time: c[4], form: c[5],
  }));
  const yeasts = parseTable(body, '## Yeast').map((c) => ({
    name: c[0], lab: c[1], productId: c[2], type: c[3], form: c[4], attenuation: c[5],
  }));
  const miscs = parseTable(body, '## Misc / Water Agents').map((c) => ({
    name: c[0], type: c[1], use: c[2], time: c[3], amount: c[4],
  }));
  const mashSteps = parseTable(body, '## Mash Steps').map((c) => ({
    name: c[0], type: c[1], stepTemp: c[2], stepTime: c[3], rampTime: c[4],
  }));

  const tasteNotes = parseSectionText(body, '## Tasting Notes', /\n##\s/);
  const notes = parseSectionText(body, "## Brewer's Notes", /\n##\s/);

  let style = null;
  if (fm.style) {
    const styleFile = resolveStylePage(fm.style);
    if (styleFile) style = parseStyleStats(styleFile);
    else style = { name: fm.style.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0] };
  }

  return { name, fm, fermentables, hops, yeasts, miscs, mashSteps, tasteNotes, notes, style };
}

// ---------- structured recipe -> BeerXML ----------

function buildXml(rec) {
  const fm = rec.fm;
  const style = rec.style;
  const styleXml = style
    ? `    <STYLE>\n` +
      `      ${tag('NAME', style.name)}\n` +
      `      ${tag('CATEGORY', style.category)}\n` +
      `      ${tag('CATEGORY_NUMBER', style.categoryNumber)}\n` +
      `      ${tag('OG_MIN', style.ogMin)}\n` +
      `      ${tag('OG_MAX', style.ogMax)}\n` +
      `      ${tag('FG_MIN', style.fgMin)}\n` +
      `      ${tag('FG_MAX', style.fgMax)}\n` +
      `      ${tag('IBU_MIN', style.ibuMin)}\n` +
      `      ${tag('IBU_MAX', style.ibuMax)}\n` +
      `      ${tag('COLOR_MIN', style.srmMin)}\n` +
      `      ${tag('COLOR_MAX', style.srmMax)}\n` +
      `      ${tag('ABV_MIN', style.abvMin)}\n` +
      `      ${tag('ABV_MAX', style.abvMax)}\n` +
      `    </STYLE>\n`
    : '';

  const fermentablesXml = rec.fermentables.map((f) => (
    `      <FERMENTABLE>\n` +
    `        ${tag('NAME', f.name)}\n` +
    `        ${tag('TYPE', f.type)}\n` +
    `        ${tag('AMOUNT', f.amount)}\n` +
    `        ${tag('YIELD', f.yield)}\n` +
    `        ${tag('COLOR', f.color)}\n` +
    `        ${tag('ADD_AFTER_BOIL', boolYesNo(f.addAfterBoil))}\n` +
    `      </FERMENTABLE>\n`
  )).join('');

  const hopsXml = rec.hops.map((h) => (
    `      <HOP>\n` +
    `        ${tag('NAME', h.name)}\n` +
    `        ${tag('ALPHA', h.alpha)}\n` +
    `        ${tag('AMOUNT', h.amount !== undefined && h.amount !== '' ? (parseFloat(h.amount) / 1000).toString() : '')}\n` +
    `        ${tag('USE', h.use)}\n` +
    `        ${tag('TIME', h.time)}\n` +
    `        ${tag('FORM', h.form)}\n` +
    `      </HOP>\n`
  )).join('');

  const yeastsXml = rec.yeasts.map((y) => (
    `      <YEAST>\n` +
    `        ${tag('NAME', y.name)}\n` +
    `        ${tag('TYPE', y.type)}\n` +
    `        ${tag('FORM', y.form)}\n` +
    `        ${tag('LABORATORY', y.lab)}\n` +
    `        ${tag('PRODUCT_ID', y.productId)}\n` +
    `        ${tag('ATTENUATION', y.attenuation)}\n` +
    `      </YEAST>\n`
  )).join('');

  const miscsXml = rec.miscs.map((mi) => (
    `      <MISC>\n` +
    `        ${tag('NAME', mi.name)}\n` +
    `        ${tag('TYPE', mi.type)}\n` +
    `        ${tag('USE', mi.use)}\n` +
    `        ${tag('TIME', mi.time)}\n` +
    `        ${tag('AMOUNT', mi.amount)}\n` +
    `      </MISC>\n`
  )).join('');

  const mashXml = rec.mashSteps.length
    ? `    <MASH>\n` +
      `      ${tag('NAME', 'Mash')}\n` +
      `      <MASH_STEPS>\n` +
      rec.mashSteps.map((s) => (
        `        <MASH_STEP>\n` +
        `          ${tag('NAME', s.name)}\n` +
        `          ${tag('TYPE', s.type)}\n` +
        `          ${tag('STEP_TEMP', s.stepTemp)}\n` +
        `          ${tag('STEP_TIME', s.stepTime)}\n` +
        `          ${tag('RAMP_TIME', s.rampTime)}\n` +
        `        </MASH_STEP>\n`
      )).join('') +
      `      </MASH_STEPS>\n` +
      `    </MASH>\n`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<RECIPES>\n` +
    `  <RECIPE>\n` +
    `    ${tag('NAME', rec.name)}\n` +
    `    ${tag('VERSION', '1')}\n` +
    `    ${tag('TYPE', fm.type)}\n` +
    `    ${tag('BREWER', fm.brewer)}\n` +
    `    ${tag('BATCH_SIZE', fm.batch_size_l)}\n` +
    `    ${tag('BOIL_SIZE', fm.boil_size_l)}\n` +
    `    ${tag('BOIL_TIME', fm.boil_time_min)}\n` +
    `    ${tag('EFFICIENCY', fm.efficiency_pct)}\n` +
    styleXml +
    `    <HOPS>\n${hopsXml}    </HOPS>\n` +
    `    <FERMENTABLES>\n${fermentablesXml}    </FERMENTABLES>\n` +
    `    <MISCS>\n${miscsXml}    </MISCS>\n` +
    `    <YEASTS>\n${yeastsXml}    </YEASTS>\n` +
    mashXml +
    `    ${tag('OG', fm.og)}\n` +
    `    ${tag('FG', fm.fg)}\n` +
    `    ${tag('IBU', fm.ibu)}\n` +
    `    ${tag('EST_COLOR', fm.srm)}\n` +
    `    ${tag('EST_ABV', fm.abv)}\n` +
    `    ${tag('PRIMARY_AGE', fm.primary_age_days)}\n` +
    `    ${tag('PRIMARY_TEMP', fm.primary_temp_c)}\n` +
    `    ${tag('FORCED_CARBONATION', boolYesNo(fm.carbonation_type))}\n` +
    `    ${tag('PRIMING_SUGAR_NAME', fm.priming_sugar_name)}\n` +
    `    ${tag('PRIMING_SUGAR_EQUIV', fm.priming_sugar_equiv_kg)}\n` +
    `    ${tag('TASTE_RATING', fm.taste_rating)}\n` +
    `    ${tag('TASTE_NOTES', rec.tasteNotes)}\n` +
    `    ${tag('NOTES', rec.notes)}\n` +
    `  </RECIPE>\n` +
    `</RECIPES>\n`;
}

// ---------- BeerXML -> markdown ----------

function getTag(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`));
  return m ? xmlUnescape(m[1].trim()) : '';
}

function getAllBlocks(xml, containerTag, itemTag) {
  const cm = xml.match(new RegExp(`<${containerTag}>([\\s\\S]*?)<\\/${containerTag}>`));
  if (!cm) return [];
  const items = [];
  const re = new RegExp(`<${itemTag}>([\\s\\S]*?)<\\/${itemTag}>`, 'g');
  let m;
  while ((m = re.exec(cm[1]))) items.push(m[1]);
  return items;
}

function xmlToRecord(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const recMatch = xml.match(/<RECIPE>([\s\S]*?)<\/RECIPE>/);
  if (!recMatch) throw new Error('No <RECIPE> element found in ' + xmlPath);
  const r = recMatch[1];

  const fermentables = getAllBlocks(r, 'FERMENTABLES', 'FERMENTABLE').map((b) => ([
    getTag(b, 'NAME'), getTag(b, 'AMOUNT'), getTag(b, 'TYPE'), getTag(b, 'YIELD'),
    getTag(b, 'COLOR'), getTag(b, 'ADD_AFTER_BOIL'),
  ]));
  const hops = getAllBlocks(r, 'HOPS', 'HOP').map((b) => {
    const amountKg = parseFloat(getTag(b, 'AMOUNT') || '0');
    return [
      getTag(b, 'NAME'), Number.isFinite(amountKg) ? (amountKg * 1000).toString() : '',
      getTag(b, 'ALPHA'), getTag(b, 'USE'), getTag(b, 'TIME'), getTag(b, 'FORM'),
    ];
  });
  const yeasts = getAllBlocks(r, 'YEASTS', 'YEAST').map((b) => ([
    getTag(b, 'NAME'), getTag(b, 'LABORATORY'), getTag(b, 'PRODUCT_ID'),
    getTag(b, 'TYPE'), getTag(b, 'FORM'), getTag(b, 'ATTENUATION'),
  ]));
  const miscs = getAllBlocks(r, 'MISCS', 'MISC').map((b) => ([
    getTag(b, 'NAME'), getTag(b, 'TYPE'), getTag(b, 'USE'), getTag(b, 'TIME'), getTag(b, 'AMOUNT'),
  ]));
  const mashSteps = getAllBlocks(r, 'MASH_STEPS', 'MASH_STEP').map((b) => ([
    getTag(b, 'NAME'), getTag(b, 'TYPE'), getTag(b, 'STEP_TEMP'), getTag(b, 'STEP_TIME'), getTag(b, 'RAMP_TIME'),
  ]));

  const forcedCarb = getTag(r, 'FORCED_CARBONATION').toUpperCase() === 'TRUE';

  return {
    name: getTag(r, 'NAME'),
    fm: {
      brewer: getTag(r, 'BREWER'),
      type: getTag(r, 'TYPE'),
      style: '',
      batch_size_l: getTag(r, 'BATCH_SIZE'),
      boil_size_l: getTag(r, 'BOIL_SIZE'),
      boil_time_min: getTag(r, 'BOIL_TIME'),
      efficiency_pct: getTag(r, 'EFFICIENCY'),
      og: getTag(r, 'OG'),
      fg: getTag(r, 'FG'),
      ibu: getTag(r, 'IBU'),
      srm: getTag(r, 'EST_COLOR'),
      abv: getTag(r, 'EST_ABV'),
      primary_age_days: getTag(r, 'PRIMARY_AGE'),
      primary_temp_c: getTag(r, 'PRIMARY_TEMP'),
      carbonation_type: forcedCarb ? 'keg' : 'bottle',
      priming_sugar_name: getTag(r, 'PRIMING_SUGAR_NAME'),
      priming_sugar_equiv_kg: getTag(r, 'PRIMING_SUGAR_EQUIV'),
      taste_rating: getTag(r, 'TASTE_RATING'),
      event: '',
      placement: '',
    },
    fermentables, hops, yeasts, miscs, mashSteps,
    tasteNotes: getTag(r, 'TASTE_NOTES'),
    notes: getTag(r, 'NOTES'),
  };
}

function rowsToTable(header, cols, rows) {
  const sep = cols.map(() => '---').join(' | ');
  const body = rows.length
    ? rows.map((r) => `| ${r.map((c) => c || '').join(' | ')} |`).join('\n')
    : `| ${cols.map(() => '').join(' | ')} |`;
  return `${header}\n| ${cols.join(' | ')} |\n| ${sep} |\n${body}\n`;
}

function buildMarkdown(rec) {
  const fm = rec.fm;
  const fmLines = [
    `brewer: ${fm.brewer || ''}`,
    `type: ${fm.type || 'All Grain'}`,
    `style: "${fm.style || ''}"`,
    `batch_size_l: ${fm.batch_size_l || ''}`,
    `boil_size_l: ${fm.boil_size_l || ''}`,
    `boil_time_min: ${fm.boil_time_min || ''}`,
    `efficiency_pct: ${fm.efficiency_pct || ''}`,
    `og: ${fm.og || ''}`,
    `fg: ${fm.fg || ''}`,
    `ibu: ${fm.ibu || ''}`,
    `srm: ${fm.srm || ''}`,
    `abv: ${fm.abv || ''}`,
    `primary_age_days: ${fm.primary_age_days || ''}`,
    `primary_temp_c: ${fm.primary_temp_c || ''}`,
    `carbonation_type: ${fm.carbonation_type || 'bottle'}`,
    `priming_sugar_name: ${fm.priming_sugar_name || ''}`,
    `priming_sugar_equiv_kg: ${fm.priming_sugar_equiv_kg || ''}`,
    `taste_rating: ${fm.taste_rating || ''}`,
    `event: "${fm.event || ''}"`,
    `placement: ${fm.placement || ''}`,
  ];

  return `# ${rec.name}\n\n---\n${fmLines.join('\n')}\n---\n\n` +
    `<!-- Imported from BeerXML via beerxml-convert.js. Fill in style/event links by hand. -->\n\n` +
    rowsToTable('## Fermentables', ['Name', 'Amount (kg)', 'Type', 'Yield (%)', 'Color (SRM)', 'Add After Boil'], rec.fermentables) + '\n' +
    rowsToTable('## Hops', ['Name', 'Amount (g)', 'Alpha (%)', 'Use', 'Time (min)', 'Form'], rec.hops) + '\n' +
    rowsToTable('## Yeast', ['Name', 'Lab', 'Product ID', 'Type', 'Form', 'Attenuation (%)'], rec.yeasts) + '\n' +
    rowsToTable('## Misc / Water Agents', ['Name', 'Type', 'Use', 'Time (min)', 'Amount'], rec.miscs) + '\n' +
    rowsToTable('## Mash Steps', ['Step Name', 'Type', 'Step Temp (C)', 'Step Time (min)', 'Ramp Time (min)'], rec.mashSteps) + '\n' +
    `## Process Notes\n### Mash / Steep\n\n### Boil\n\n### Fermentation\n\n### Packaging\n\n` +
    `## Tasting Notes\n${rec.tasteNotes || ''}\n\n` +
    `## Competition Feedback\n\n` +
    `## Brewer's Notes\n${rec.notes || ''}\n`;
}

// ---------- CLI ----------

function main() {
  const [, , cmd, inPath, outPath] = process.argv;
  if (!cmd || !inPath || !['to-xml', 'to-md'].includes(cmd)) {
    console.error('Usage:\n  node beerxml-convert.js to-xml <recipe.md> [out.xml]\n  node beerxml-convert.js to-md  <recipe.xml> [out.md]');
    process.exit(1);
  }
  if (cmd === 'to-xml') {
    const rec = mdToRecord(inPath);
    const xml = buildXml(rec);
    const out = outPath || inPath.replace(/\.md$/, '.xml');
    fs.writeFileSync(out, xml, 'utf8');
    console.log('Wrote', out);
  } else {
    const rec = xmlToRecord(inPath);
    const md = buildMarkdown(rec);
    const out = outPath || inPath.replace(/\.xml$/, '.md');
    fs.writeFileSync(out, md, 'utf8');
    console.log('Wrote', out);
  }
}

if (require.main === module) main();

module.exports = { mdToRecord, buildXml, xmlToRecord, buildMarkdown };
