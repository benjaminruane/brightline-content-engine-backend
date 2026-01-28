// Diagnostic script to test actual module import
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('='.repeat(60));
console.log('DIAGNOSIS: Module Import Test');
console.log('='.repeat(60));
console.log();

try {
  const impl = await import('../lib/analyse-statements-impl.mjs');
  
  console.log('Import result:');
  console.log(`  typeof impl: ${typeof impl}`);
  console.log(`  typeof impl.default: ${typeof impl.default}`);
  console.log(`  impl.default is function: ${typeof impl.default === 'function'}`);
  
  if (typeof impl.default === 'function') {
    console.log(`  ✓ SUCCESS: Default export is a function`);
  } else {
    console.log(`  ✗ FAILURE: Default export is not a function`);
  }
  
  console.log();
  console.log('GlobalThis check:');
  console.log(`  typeof globalThis.__brightlineAnalyseStatementsHandler: ${typeof globalThis.__brightlineAnalyseStatementsHandler}`);
  
  if (typeof impl.default !== 'function') {
    console.error('\n✗ ERROR: impl.default is not a function');
    process.exit(1);
  }
  
  console.log('\n✓ Import test PASSED');
  
} catch (error) {
  console.error('\n✗ Import FAILED:');
  console.error(error.message);
  if (error.stack) {
    console.error('\nStack trace:');
    console.error(error.stack);
  }
  process.exit(1);
}
