import { handleDesktopTesting } from './build/tools/capabilities/desktop-testing.js';
import { handleAdvancedTesting } from './build/tools/capabilities/advanced-testing.js';
import { handleDatabaseTesting } from './build/tools/capabilities/database-testing.js';
import { handleServerTesting } from './build/tools/capabilities/server-testing.js';
import { handleSecurityTesting } from './build/tools/capabilities/security-testing.js';

async function runTests() {
  console.log('--- Testing Desktop ---');
  try {
    const desktopRes = await handleDesktopTesting({ action: 'system_info' });
    console.log(desktopRes.content[0].text);
  } catch (e) {
    console.error('Desktop Test Error:', e);
  }

  console.log('\n--- Testing Advanced ---');
  try {
    const advRes = await handleAdvancedTesting({ action: 'full_sanity_check' });
    console.log(advRes.content[0].text);
  } catch (e) {
    console.error('Advanced Test Error:', e);
  }

  console.log('\n--- Testing Database ---');
  try {
    const dbRes = await handleDatabaseTesting({ action: 'schema_lint' });
    console.log(dbRes.content[0].text);
  } catch (e) {
    console.error('Database Test Error:', e);
  }

  console.log('\n--- Testing Server ---');
  try {
    const srvRes = await handleServerTesting({ action: 'port_scan' });
    console.log(srvRes.content[0].text);
  } catch (e) {
    console.error('Server Test Error:', e);
  }

  console.log('\n--- Testing Security ---');
  try {
    const secRes = await handleSecurityTesting({ action: 'dast_scan' });
    console.log(secRes.content[0].text);
  } catch (e) {
    console.error('Security Test Error:', e);
  }
}

runTests().catch(console.error);
