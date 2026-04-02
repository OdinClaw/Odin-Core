#!/usr/bin/env node

/**
 * sanitize_export.js
 * Removes machine paths, tokens, and other sensitive data from export
 */

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || process.env.USERPROFILE;
const WORKSPACE = path.join(HOME, '.openclaw-odin', 'workspace');

// Patterns to redact
const REDACT_PATTERNS = [
  {
    name: 'machine_paths',
    pattern: new RegExp(HOME.replace(/\//g, '\\/'), 'g'),
    replacement: '/home/user',
  },
  {
    name: 'tokens',
    pattern: /Bearer\s+[a-zA-Z0-9\-_.~+\/]+=*/gi,
    replacement: 'Bearer [REDACTED_TOKEN]',
  },
  {
    name: 'api_keys',
    pattern: /(["\']?(?:api[_-]?key|apikey)["\']?\s*[:=]\s*)[^\s,}]+/gi,
    replacement: '$1[REDACTED_API_KEY]',
  },
  {
    name: 'auth_tokens',
    pattern: /(["\']?(?:token|auth)["\']?\s*[:=]\s*)[^\s,}]+/gi,
    replacement: '$1[REDACTED_TOKEN]',
  },
];

function sanitizeContent(content) {
  let sanitized = content;
  const redactions = [];

  REDACT_PATTERNS.forEach(({ name, pattern, replacement }) => {
    const matches = content.match(pattern);
    if (matches) {
      redactions.push({ pattern: name, count: matches.length });
      sanitized = sanitized.replace(pattern, replacement);
    }
  });

  return { sanitized, redactions };
}

function sanitizeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { sanitized, redactions } = sanitizeContent(content);
    
    return {
      path: filePath,
      changed: content !== sanitized,
      redactions,
      size: sanitized.length,
    };
  } catch (e) {
    return {
      path: filePath,
      error: e.message,
    };
  }
}

function main() {
  // Read file list from stdin (passed as JSON from collect_files.js)
  let input = '';
  process.stdin.on('data', chunk => input += chunk);
  
  process.stdin.on('end', () => {
    try {
      const fileData = JSON.parse(input);
      
      const results = {
        totalFiles: 0,
        sanitized: 0,
        redactions: [],
      };

      // Flatten file list
      const allFiles = [];
      Object.values(fileData.byCategory).forEach(items => {
        items.forEach(item => {
          allFiles.push(path.join(WORKSPACE, item));
        });
      });

      allFiles.forEach(filePath => {
        const result = sanitizeFile(filePath);
        results.totalFiles++;
        if (result.changed) {
          results.sanitized++;
          if (result.redactions) {
            result.redactions.forEach(r => {
              const existing = results.redactions.find(x => x.pattern === r.pattern);
              if (existing) {
                existing.count += r.count;
              } else {
                results.redactions.push(r);
              }
            });
          }
        }
      });

      console.log(`Scanned ${results.totalFiles} file(s)`);
      console.log(`Sanitized ${results.sanitized} file(s)`);
      results.redactions.forEach(r => {
        console.log(`  - ${r.pattern}: ${r.count} redaction(s)`);
      });

      // Output JSON
      console.log('\n---JSON---');
      console.log(JSON.stringify(results, null, 2));

    } catch (e) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });
}

main();
