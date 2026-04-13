#!/usr/bin/env node

/**
 * collect_files.js
 * Collects files for system export, organized by category
 */

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || process.env.USERPROFILE;
const WORKSPACE = path.join(HOME, '.openclaw-odin', 'workspace');

// Files to collect for system export
const EXPORT_PATTERNS = {
  config: [
    'openclaw.json',
    'package.json',
    'package-lock.json',
  ],
  agents: [
    'agents/*/SOUL.md',
    'agents/*/IDENTITY.md',
    'agents/*/MISSION.md',
    'agents/*/AGENTS.md',
    'agents/*/SKILLS.md',
  ],
  docs: [
    'MEMORY.md',
    'README.md',
  ],
};

function glob(pattern, baseDir) {
  const results = [];
  const parts = pattern.split('/');
  const totalDepth = parts.length;

  function expand(dir, patternParts, depth = 0) {
    if (depth >= totalDepth) return;

    const part = parts[depth];

    if (part === '*') {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        entries.forEach(entry => {
          if (entry.isDirectory()) {
            // Advance past the '*' in parts by passing patternParts starting after it
            expand(path.join(dir, entry.name), patternParts.slice(1), depth + 1);
          }
        });
      } catch (e) {
        // Directory doesn't exist
      }
    } else if (depth + 1 === totalDepth) {
      // Final segment — match as file or exact dir name
      const fullPath = path.join(dir, part);
      if (fs.existsSync(fullPath)) {
        results.push(fullPath.replace(baseDir + '/', ''));
      }
    } else {
      const nextDir = path.join(dir, part);
      if (fs.existsSync(nextDir)) {
        expand(nextDir, patternParts.slice(1), depth + 1);
      }
    }
  }
  
  expand(baseDir, parts);
  return results;
}

function collectFiles() {
  const files = {
    total: 0,
    byCategory: {},
    notFound: [],
  };

  Object.entries(EXPORT_PATTERNS).forEach(([category, patterns]) => {
    files.byCategory[category] = [];
    
    patterns.forEach(pattern => {
      if (pattern.includes('*')) {
        const matches = glob(pattern, WORKSPACE);
        matches.forEach(match => {
          const fullPath = path.join(WORKSPACE, match);
          if (fs.existsSync(fullPath)) {
            files.byCategory[category].push(match);
            files.total++;
          }
        });
      } else {
        const fullPath = path.join(WORKSPACE, pattern);
        if (fs.existsSync(fullPath)) {
          files.byCategory[category].push(pattern);
          files.total++;
        } else {
          files.notFound.push(pattern);
        }
      }
    });
  });

  return files;
}

function main() {
  const files = collectFiles();
  
  console.log(`Found ${files.total} file(s)`);
  
  Object.entries(files.byCategory).forEach(([category, items]) => {
    if (items.length > 0) {
      console.log(`\n[${category}] ${items.length} file(s):`);
      items.slice(0, 5).forEach(item => console.log(`  - ${item}`));
      if (items.length > 5) {
        console.log(`  ... and ${items.length - 5} more`);
      }
    }
  });

  if (files.notFound.length > 0) {
    console.log(`\n⚠ Not found: ${files.notFound.join(', ')}`);
  }

  // Output JSON for downstream processing
  console.log('\n---JSON---');
  console.log(JSON.stringify(files, null, 2));
}

main();
