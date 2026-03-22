#!/usr/bin/env node
'use strict';
/**
 * query.js — CLI query tool for Adam's memory indexes
 *
 * Usage:
 *   node query.js [index_type] [options]
 *
 * index_type: architecture | decision | summary | all  (default: all)
 *
 * Query modes:
 *   --search "<text>"         Full-text keyword search (ranked by relevance)
 *   --agent  "<name>"         Filter by agent involved
 *   --topic  "<text>"         Substring match on topic
 *   --tag    "<tag>"          Exact tag match
 *   --from   "YYYY-MM-DD"     Date lower bound
 *   --to     "YYYY-MM-DD"     Date upper bound
 *   --file   "<substring>"    Filter by file path substring
 *   --recent [N]              Most recent N entries (default 10)
 *   --stats                   Show index statistics only
 *   --id     "<uuid>"         Look up a specific entry by id
 *   --limit  <N>              Max results per index (default 20)
 *   --json                    Output raw JSON instead of formatted table
 *
 * Examples:
 *   node query.js --search "model routing fallback"
 *   node query.js architecture --agent thor --from 2026-01-01
 *   node query.js decision --topic "gateway" --json
 *   node query.js --stats
 *   node query.js --recent 5
 */

const { query, search, getAll, getById, stats, VALID_TYPES } = require('./index_manager');

// ── Arg parser ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags  = {};
  const pos    = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
        i++;
      } else {
        flags[key] = next;
        i += 2;
      }
    } else {
      pos.push(a);
      i++;
    }
  }
  return { flags, pos };
}

// ── Formatters ────────────────────────────────────────────────────────────────

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const CYAN   = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';

function c(color, str) {
  return process.stdout.isTTY ? `${color}${str}${RESET}` : str;
}

function printEntry(entry, idx, score) {
  const agents = entry.agents_involved.length
    ? entry.agents_involved.join(', ')
    : c(DIM, 'none');

  const scoreStr = score != null ? c(DIM, `  score:${score}`) : '';

  console.log(`${c(BOLD, `[${idx + 1}]`)} ${c(CYAN, entry.date)}  ${c(YELLOW, entry.topic)}${scoreStr}`);
  console.log(`     ${c(DIM, 'agents:')} ${agents}`);
  console.log(`     ${c(DIM, 'file:')}   ${entry.file}`);
  if (entry.summary) {
    const short = entry.summary.length > 120
      ? entry.summary.slice(0, 120) + '…'
      : entry.summary;
    console.log(`     ${c(DIM, 'summary:')}${short}`);
  }
  if (entry.tags && entry.tags.length) {
    console.log(`     ${c(DIM, 'tags:')}   ${c(DIM, entry.tags.slice(0, 8).join(', '))}`);
  }
  console.log(`     ${c(DIM, 'id:')}     ${c(DIM, entry.id)}`);
  console.log();
}

function printStats(type) {
  const s = stats(type);
  let line = `${c(BOLD, type.padEnd(14))} ${c(GREEN, String(s.count).padStart(4))} entries`;
  if (s.count > 0) {
    line += `  ${c(DIM, s.oldest)} → ${c(DIM, s.newest)}`;
    if (s.agents.length) line += `  agents: ${s.agents.join(', ')}`;
    console.log(line);
    if (s.top_tags.length) {
      const tagStr = s.top_tags.map(t => `${t.tag}(${t.freq})`).join(', ');
      console.log(`${' '.repeat(16)}top tags: ${c(DIM, tagStr)}`);
    }
  } else {
    console.log(line);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const { flags, pos } = parseArgs(process.argv.slice(2));

  // Determine which index types to query
  const typeArg = pos[0];
  let types;
  if (!typeArg || typeArg === 'all') {
    types = [...VALID_TYPES];
  } else if (VALID_TYPES.includes(typeArg)) {
    types = [typeArg];
  } else {
    console.error(`Unknown index type "${typeArg}". Valid: all, ${VALID_TYPES.join(', ')}`);
    process.exit(1);
  }

  const useJson  = !!flags.json;
  const limit    = parseInt(flags.limit || '20', 10);

  // ── --help ─────────────────────────────────────────────────────────────────
  if (flags.help || flags.h) {
    const helpText = `
  node query.js [architecture|decision|summary|all] [options]

  --search "<text>"      Full-text keyword search (ranked by relevance)
  --agent  "<name>"      Filter by agent involved
  --topic  "<text>"      Substring match on topic
  --tag    "<tag>"       Exact tag match
  --from   YYYY-MM-DD    Date lower bound
  --to     YYYY-MM-DD    Date upper bound
  --file   "<substring>" Filter by file path
  --recent [N]           Most recent N entries (default 10)
  --stats                Index statistics
  --id     "<uuid>"      Look up entry by id
  --limit  <N>           Max results (default 20)
  --json                 Raw JSON output
`;
    console.log(helpText);
    return;
  }

  // ── --stats ────────────────────────────────────────────────────────────────
  if (flags.stats) {
    console.log(`\n${c(BOLD, 'Memory Index Statistics')}\n`);
    for (const t of types) printStats(t);
    console.log();
    return;
  }

  // ── --id ───────────────────────────────────────────────────────────────────
  if (flags.id) {
    let found = null;
    for (const t of types) {
      found = getById(t, flags.id);
      if (found) { found._index_type = t; break; }
    }
    if (!found) {
      console.error(`Entry not found: ${flags.id}`);
      process.exit(1);
    }
    if (useJson) {
      console.log(JSON.stringify(found, null, 2));
    } else {
      console.log(`\n${c(BOLD, `[${found._index_type}]`)}\n`);
      printEntry(found, 0, null);
    }
    return;
  }

  // ── --recent ───────────────────────────────────────────────────────────────
  if (flags.recent !== undefined) {
    const n = parseInt(flags.recent === true ? '10' : flags.recent, 10);
    const allEntries = types.flatMap(t =>
      getAll(t, { sortBy: 'date', order: 'desc' })
        .slice(0, n)
        .map(e => ({ ...e, _type: t }))
    );
    allEntries.sort((a, b) => b.date.localeCompare(a.date));
    const sliced = allEntries.slice(0, n);

    if (useJson) { console.log(JSON.stringify(sliced, null, 2)); return; }

    console.log(`\n${c(BOLD, `Recent ${n} documents`)}\n`);
    sliced.forEach((e, i) => {
      console.log(c(DIM, `[${e._type}]`));
      printEntry(e, i, null);
    });
    return;
  }

  // ── Full-text --search ─────────────────────────────────────────────────────
  if (flags.search) {
    const opts = { limit, dateFrom: flags.from, dateTo: flags.to };

    let allResults = [];
    for (const t of types) {
      const results = search(t, flags.search, opts);
      allResults.push(...results.map(r => ({ ...r, _type: t })));
    }
    allResults.sort((a, b) => b.score - a.score);
    allResults = allResults.slice(0, limit);

    if (useJson) { console.log(JSON.stringify(allResults, null, 2)); return; }

    if (allResults.length === 0) {
      console.log(`\n${c(DIM, `No results for "${flags.search}"`)}\n`);
      return;
    }

    console.log(`\n${c(BOLD, `Search: "${flags.search}"'`)}  ${c(DIM, `(${allResults.length} result(s))`)}\n`);
    allResults.forEach((r, i) => {
      const kwStr = r.matched_keywords.length ? c(GREEN, ` [${r.matched_keywords.join(', ')}]`) : '';
      console.log(c(DIM, `[${r._type}]`) + kwStr);
      printEntry(r.entry, i, r.score);
    });
    return;
  }

  // ── Structured filter (agent, topic, tag, date, file) ─────────────────────
  const filter = {
    limit,
    offset:   parseInt(flags.offset || '0', 10),
    sortBy:   flags.sort  || 'date',
    order:    flags.order || 'desc',
    agent:    flags.agent || undefined,
    topic:    flags.topic || undefined,
    tag:      flags.tag   || undefined,
    file:     flags.file  || undefined,
    dateFrom: flags.from  || undefined,
    dateTo:   flags.to    || undefined,
  };
  // Strip undefined
  Object.keys(filter).forEach(k => filter[k] === undefined && delete filter[k]);

  let allResults = [];
  for (const t of types) {
    const results = query(t, filter);
    allResults.push(...results.map(e => ({ ...e, _type: t })));
  }
  allResults.sort((a, b) => b.date.localeCompare(a.date));
  allResults = allResults.slice(0, limit);

  if (useJson) { console.log(JSON.stringify(allResults, null, 2)); return; }

  // Build header describing active filters
  const active = Object.entries(filter)
    .filter(([k]) => !['limit', 'offset', 'sortBy', 'order'].includes(k))
    .map(([k, v]) => `${k}=${v}`);

  const header = active.length
    ? `Filter: ${active.join('  ')}`
    : 'All entries';
  const indexLabel = types.length === VALID_TYPES.length ? 'all indexes' : types.join(', ');

  console.log(`\n${c(BOLD, header)}  ${c(DIM, `(${indexLabel}, ${allResults.length} result(s))`)} \n`);

  if (allResults.length === 0) {
    console.log(c(DIM, 'No matching entries.\n'));
    return;
  }

  allResults.forEach((e, i) => {
    console.log(c(DIM, `[${e._type}]`));
    printEntry(e, i, null);
  });
}

main();
