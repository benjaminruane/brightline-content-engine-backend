// Diagnostic script to analyze handler scope using acorn parser
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to import acorn
let acorn;
try {
  acorn = await import('acorn');
} catch (e) {
  console.error('acorn not found. Installing as dev dependency...');
  const { execSync } = await import('child_process');
  execSync('npm install --save-dev acorn', { stdio: 'inherit', cwd: join(__dirname, '..') });
  acorn = await import('acorn');
}

const filePath = join(__dirname, '..', 'lib', 'analyse-statements-impl.mjs');
const content = fs.readFileSync(filePath, 'utf-8');

console.log('='.repeat(60));
console.log('DIAGNOSIS: Handler Scope Analysis');
console.log('='.repeat(60));

try {
  const ast = acorn.Parser.parse(content, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
    ranges: true,
  });

  let exportDefault = null;
  let handlerDeclaration = null;
  let handlerEnclosingBlocks = [];

  function walk(node, depth = 0, parent = null, blockStack = []) {
    const isBlock = node.type === 'BlockStatement' || 
                   (node.type === 'FunctionDeclaration' && node.body);
    
    if (isBlock) {
      blockStack = [...blockStack, {
        type: node.type,
        line: node.loc?.start?.line,
        name: node.id?.name || (node.type === 'BlockStatement' ? 'BlockStatement' : 'anonymous'),
        depth,
      }];
    }

    if (node.type === 'ExportDefaultDeclaration') {
      exportDefault = {
        declaration: node.declaration,
        line: node.loc?.start?.line,
      };
    }

    if (node.type === 'FunctionDeclaration' && node.id?.name === 'handler') {
      handlerDeclaration = {
        name: node.id.name,
        line: node.loc?.start?.line,
        isAsync: node.async || false,
        depth,
        parentType: parent?.type || 'root',
        enclosingBlocks: blockStack.slice(), // Copy the stack
      };
      handlerEnclosingBlocks = blockStack;
    }

    for (const key in node) {
      if (key === 'parent' || key === 'range' || key === 'loc') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(c => {
          if (c && typeof c === 'object' && c.type) {
            const newDepth = depth + (c.type === 'BlockStatement' ? 1 : 0);
            walk(c, newDepth, node, blockStack);
          }
        });
      } else if (child && typeof child === 'object' && child.type) {
        const newDepth = depth + (child.type === 'BlockStatement' ? 1 : 0);
        walk(child, newDepth, node, blockStack);
      }
    }
  }

  walk(ast);

  console.log('EXPORT DEFAULT ANALYSIS:');
  if (exportDefault) {
    console.log(`  ✓ Found export default at line ${exportDefault.line}`);
    if (exportDefault.declaration.type === 'Identifier') {
      console.log(`  → References: "${exportDefault.declaration.name}"`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('HANDLER DECLARATION ANALYSIS:');
  if (handlerDeclaration) {
    console.log(`  ✓ Found handler at line ${handlerDeclaration.line}`);
    console.log(`  - Depth: ${handlerDeclaration.depth}`);
    console.log(`  - Is at module scope: ${handlerDeclaration.depth === 0 ? 'YES ✓' : 'NO ✗'}`);
    
    if (handlerEnclosingBlocks.length > 0) {
      console.log(`\n  Enclosing blocks (from outermost to innermost):`);
      handlerEnclosingBlocks.forEach((block, idx) => {
        console.log(`    ${idx + 1}. ${block.type} "${block.name}" at line ${block.line}, depth ${block.depth}`);
      });
      
      console.log(`\n  FIX: Close these ${handlerEnclosingBlocks.length} block(s) before handler`);
      console.log(`       to bring handler to module scope.`);
    }
  }

  console.log('\n' + '='.repeat(60));

} catch (error) {
  console.error('Parse error:', error.message);
  if (error.loc) {
    console.error(`  At line ${error.loc.line}, column ${error.loc.column}`);
  }
  process.exit(1);
}
