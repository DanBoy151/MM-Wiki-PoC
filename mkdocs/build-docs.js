#!/usr/bin/env node
/*
 * build-docs.js — generates mkdocs/docs/ from ../wiki/ (the Obsidian vault).
 * Zero dependencies, documentation-branch only (never runs against main).
 *
 * - wiki/Home.md            -> docs/index.md
 * - <dir>/README.md         -> <dir>/index.md   (MkDocs folder landing page convention)
 * - [[Target]] / [[Target|Alias]] -> relative markdown links, resolved against the
 *   wiki tree (path-style targets relative to the source file, bare names by search).
 * - housekeeping/Templates/*.md keep their leading frontmatter block visible by
 *   wrapping it in a fenced ```yaml block instead of letting MkDocs strip it as
 *   real page metadata.
 * - Non-markdown files are not copied into docs/.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MKDOCS_DIR = __dirname;
const WIKI_ROOT = path.join(MKDOCS_DIR, '..', 'wiki');
const DOCS_DIR = path.join(MKDOCS_DIR, 'docs');

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

function mapOutputRelPath(relPath) {
  if (relPath === 'Home.md') return 'index.md';
  if (path.basename(relPath).toLowerCase() === 'readme.md') {
    return path.posix.join(path.dirname(relPath).split(path.sep).join('/'), 'index.md');
  }
  return relPath;
}

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- wikilink resolution ----------

let allWikiFiles = null; // relative POSIX paths from WIKI_ROOT, cached
function getAllWikiFiles() {
  if (!allWikiFiles) allWikiFiles = walk(WIKI_ROOT).filter((f) => f.endsWith('.md'));
  return allWikiFiles;
}

function resolveWikilinkTarget(targetRaw, sourceRelPath) {
  const hasExt = targetRaw.toLowerCase().endsWith('.md');
  if (targetRaw.includes('/')) {
    const sourceDir = path.dirname(path.join(WIKI_ROOT, sourceRelPath));
    const abs = path.resolve(sourceDir, hasExt ? targetRaw : `${targetRaw}.md`);
    if (fs.existsSync(abs)) return path.relative(WIKI_ROOT, abs).split(path.sep).join('/');
    return null;
  }
  const wantName = (hasExt ? targetRaw : `${targetRaw}.md`).toLowerCase();
  const match = getAllWikiFiles().find((f) => path.basename(f).toLowerCase() === wantName);
  return match || null;
}

function displayNameFor(relPath) {
  return path.basename(relPath, '.md').replace(/-/g, ' ');
}

function relativeLink(fromOutputRelPath, toOutputRelPath) {
  const fromDir = path.posix.dirname(fromOutputRelPath);
  let rel = path.posix.relative(fromDir, toOutputRelPath);
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function convertWikilinks(text, sourceRelPath) {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (whole, targetRaw, aliasRaw) => {
    const target = targetRaw.trim();
    const alias = aliasRaw ? aliasRaw.trim() : null;
    const resolved = resolveWikilinkTarget(target, sourceRelPath);
    if (!resolved) {
      console.warn(`[build-docs] broken wikilink in ${sourceRelPath}: [[${target}]]`);
      return alias || target;
    }
    const fromOut = mapOutputRelPath(sourceRelPath);
    const toOut = mapOutputRelPath(resolved);
    const linkText = alias || displayNameFor(resolved);
    return `[${linkText}](${relativeLink(fromOut, toOut)})`;
  });
}

// ---------- per-file handling ----------

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

function isTemplatePage(relPath) {
  return relPath.startsWith('housekeeping/Templates/');
}

function buildOutput(relPath, raw) {
  if (isTemplatePage(relPath)) {
    const m = raw.match(FRONTMATTER_RE);
    if (m) {
      const body = convertWikilinks(raw.slice(m[0].length), relPath);
      return '```yaml\n' + m[0] + '```\n\n' + body;
    }
  }
  return convertWikilinks(raw, relPath);
}

function main() {
  rimraf(DOCS_DIR);
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  const files = walk(WIKI_ROOT);
  let written = 0;
  for (const relPath of files) {
    if (!relPath.endsWith('.md')) continue; // non-markdown assets are not published
    const raw = fs.readFileSync(path.join(WIKI_ROOT, relPath), 'utf8');
    const output = buildOutput(relPath, raw);
    const outRelPath = mapOutputRelPath(relPath);
    const outPath = path.join(DOCS_DIR, outRelPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output, 'utf8');
    written++;
  }
  console.log(`[build-docs] wrote ${written} pages to ${path.relative(MKDOCS_DIR, DOCS_DIR)}`);
}

if (require.main === module) main();

module.exports = { mapOutputRelPath, convertWikilinks, resolveWikilinkTarget };
