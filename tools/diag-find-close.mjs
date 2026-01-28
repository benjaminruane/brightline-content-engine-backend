// Find where buildReasonsFromCanonicalClaims should close
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let acorn;
try {
  acorn = await import('acorn');
} catch (e) {
  const { execSync } = await import('child_process');
  execSync('npm install --save-dev acorn', { stdio: 'inherit', cwd: join(__dirname, '..') });
  acorn = await import('acorn');
}

const filePath = join(__dirname, '..', 'lib', 'analyse-statements-impl.mjs');
const content = fs.readFileSync(filePath, 'utf-8');

try {
  const ast = acorn.Parser.parse(content, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
    ranges: true,
  });

  let buildReasonsFunc = null;
  let handlerFunc = null;

  function walk(node) {
    if (node.type === 'FunctionDeclaration') {
      if (node.id?.name === 'buildReasonsFromCanonicalClaims') {
        buildReasonsFunc = {
          name: node.id.name,
          startLine: node.loc?.start?.line,
          endLine: node.loc?.end?.line,
          bodyEndLine: node.body?.loc?.end?.line,
        };
      }
      if (node.id?.name === 'handler') {
        handlerFunc = {
          name: node.id.name,
          startLine: node.loc?.start?.line,
          endLine: node.loc?.end?.line,
        };
      }
    }

    for (const key in node) {
      if (key === 'parent' || key === 'range' || key === 'loc') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(c => {
          if (c && typeof c === 'object' && c.type) {
            walk(c);
          }
        });
      } else if (child && typeof child === 'object' && child.type) {
        walk(child);
      }
    }
  }

  walk(ast);

  console.log('='.repeat(60));
  console.log('FUNCTION CLOSURE ANALYSIS');
  console.log('='.repeat(60));
  
  if (buildReasonsFunc) {
    console.log(`\nbuildReasonsFromCanonicalClaims:`);
    console.log(`  Starts at line: ${buildReasonsFunc.startLine}`);
    console.log(`  Body ends at line: ${buildReasonsFunc.bodyEndLine}`);
    console.log(`  Function ends at line: ${buildReasonsFunc.endLine}`);
  }
  
  if (handlerFunc) {
    console.log(`\nhandler:`);
    console.log(`  Starts at line: ${handlerFunc.startLine}`);
    console.log(`  Function ends at line: ${handlerFunc.endLine}`);
  }
  
  if (buildReasonsFunc && handlerFunc) {
    console.log(`\nAnalysis:`);
    if (handlerFunc.startLine < buildReasonsFunc.endLine) {
      console.log(`  ✓ handler is INSIDE buildReasonsFromCanonicalClaims`);
      console.log(`  → buildReasonsFromCanonicalClaims should close AFTER handler`);
      console.log(`  → Current end line: ${buildReasonsFunc.endLine}`);
      console.log(`  → Should close at: right before export (around line 27070)`);
    } else {
      console.log(`  ✗ handler is OUTSIDE buildReasonsFromCanonicalClaims`);
      console.log(`  → buildReasonsFromCanonicalClaims closes at: ${buildReasonsFunc.endLine}`);
      console.log(`  → handler starts at: ${handlerFunc.startLine}`);
    }
  }

} catch (error) {
  console.error('Parse error:', error.message);
  if (error.loc) {
    console.error(`  At line ${error.loc.line}, column ${error.loc.column}`);
  }
  process.exit(1);
}
