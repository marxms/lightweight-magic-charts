import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Dirent } from 'fs';

/**
 * The source-reading half of every deterministic gate in this package.
 *
 * These three functions used to live inside `boundary.spec.ts`, where they were written for the
 * boundary guard alone. The size gate needs the very same comment remover, and a second copy of a
 * regex is a second declaration of one fact: the day someone teaches one copy about template
 * literals, the other keeps flagging prose. So the definitions moved here and `boundary.spec.ts`
 * imports them — one definition, two callers, no drift.
 *
 * This file is deliberately NOT a `.spec.ts`: jest matches only `*.spec.*` and `*.test.*`, so a
 * helper imported by a suite runs once, inside its importer, and registers no tests of its own.
 */

export interface Source {
  readonly file: string;
  readonly text: string;
}

/**
 * Strip comments before scanning for forbidden WORDS.
 *
 * Without this the guards flag themselves: the doc comment that explains "this file may not name a
 * business concept" names several, and the one explaining "there is no register(name, factory)"
 * contains the very string it forbids. A rule stated in prose must not violate itself — the guard
 * is about code, and prose about the rule is the opposite of a breach of it.
 *
 * The `[^:]` before `//` is what keeps a URL inside a string from being read as a comment.
 */
export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function collectSources(dir: string, prefix = ''): Source[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry: Dirent): Source[] => {
    const abs = join(dir, entry.name);
    const rel = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return collectSources(abs, `${rel}/`);
    // `.tsx` TOO. It was `.ts` only, and the day components arrived that single character would have
    // made every guard in this file skip exactly the modules most likely to breach them — a green
    // suite scanning the half of the package that never imports anything.
    if (!/\.tsx?$/.test(entry.name)) return [];
    return [{ file: rel, text: readFileSync(abs, 'utf8') }];
  });
}

/**
 * The same walk, for Markdown — RECURSIVE, which is the whole point of it existing.
 *
 * `docs/` used to be flat, so both gates that read it listed one directory and were right. The four
 * quadrants put the corpus one level down, and a flat `readdirSync` would have gone on returning a
 * number, just a much smaller one: the sweep would still be green while reading almost nothing. A
 * directory outside the reach is not an exemption, it is a blind spot — the same sentence the
 * dangling-reference gate already wrote about `test/`.
 */
export function collectMarkdown(dir: string, prefix = ''): Source[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry: Dirent): Source[] => {
    const abs = join(dir, entry.name);
    const rel = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return collectMarkdown(abs, `${rel}/`);
    if (!entry.name.endsWith('.md')) return [];
    return [{ file: rel, text: readFileSync(abs, 'utf8') }];
  });
}

export interface CommentLine {
  readonly line: number;
  readonly text: string;
}

/**
 * The exact complement of `stripComments`: what that function throws away, this one keeps.
 *
 * Written from the SAME two patterns on purpose. The dangling-reference gate scans inside comments
 * while every other guard scans outside them, and if the two disagreed about where a comment ends,
 * a plan reference could sit in the gap that neither reads.
 */
export function commentsOf(text: string): CommentLine[] {
  const found: CommentLine[] = [];
  const lineOf = (index: number): number => text.slice(0, index).split('\n').length;
  const block = /\/\*[\s\S]*?\*\//g;
  let match = block.exec(text);
  while (match !== null) {
    const first = lineOf(match.index);
    match[0].split('\n').forEach((piece, offset) => {
      if (piece.trim().length > 0) found.push({ line: first + offset, text: piece });
    });
    match = block.exec(text);
  }
  // Block comments are blanked out (newlines kept, so line numbers survive) before the line
  // pattern runs: a `//` INSIDE a block comment is one comment, not two.
  const withoutBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const line = /(^|[^:])(\/\/.*)$/gm;
  match = line.exec(withoutBlocks);
  while (match !== null) {
    found.push({ line: lineOf(match.index), text: match[2] });
    match = line.exec(withoutBlocks);
  }
  return found.sort((a, b) => a.line - b.line);
}

/**
 * Lines of CODE: comments removed first, then blank lines dropped.
 *
 * Counting raw lines would let a file buy headroom by deleting documentation, which is the opposite
 * of what the ceiling is for. Counting after the strip means a doc comment is free and a statement
 * is not.
 */
export function codeLines(text: string): number {
  return stripComments(text)
    .split('\n')
    .filter((line) => line.trim().length > 0).length;
}
