#!/usr/bin/env bun
/**
 * Find working ShadowWire API endpoints
 */

const endpoints = [
  'https://shadow.radr.fun',
  'https://api.shadow.radr.fun',
  'https://shadowwire.radr.fun',
  'https://api.shadowwire.io',
  'https://shadowpay.radr.fun',
  'https://api.shadowpay.io',
];

const paths = ['/', '/health', '/api', '/api/v1', '/config', '/tokens'];

async function checkEndpoint(base: string, path: string) {
  try {
    const resp = await fetch(`${base}${path}`, { 
      signal: AbortSignal.timeout(5000) 
    });
    return { status: resp.status, ok: resp.ok };
  } catch (e: any) {
    return { status: 0, error: e.code || e.message };
  }
}

async function main() {
  console.log('\n=== Checking ShadowWire API Endpoints ===\n');
  
  for (const base of endpoints) {
    console.log(`\n${base}:`);
    for (const path of paths) {
      const result = await checkEndpoint(base, path);
      const status = result.ok ? '✅' : result.status > 0 ? '⚠️' : '❌';
      console.log(`  ${status} ${path}: ${result.status || result.error}`);
    }
  }
  
  // Also check the SDK's default endpoint
  console.log('\n\n=== Checking SDK Configuration ===\n');
  try {
    const sw = await import('@radr/shadowwire');
    console.log('SDK exports:', Object.keys(sw).slice(0, 15).join(', '), '...');
    
    // Try to find API_URL or similar
    for (const key of Object.keys(sw)) {
      if (key.includes('URL') || key.includes('API') || key.includes('ENDPOINT')) {
        console.log(`${key}: ${(sw as any)[key]}`);
      }
    }
  } catch (e) {
    console.log('SDK import failed');
  }
}

main();
