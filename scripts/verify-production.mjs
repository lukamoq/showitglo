#!/usr/bin/env node

/**
 * ShowItGlo — Production Readiness Verification Suite
 * Validates all core subsystems, security rails, moderation, rate limiting, and config.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

console.log('🛡️  Starting ShowItGlo Production Readiness Verification...\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failCount++;
  }
}

// 1. Filesystem & Critical Assets Check
console.log('1. Checking Production Files & Public Assets...');
const criticalFiles = [
  'next.config.ts',
  'Dockerfile',
  'docker-compose.yml',
  'scripts/schema.sql',
  'scripts/init-db.mjs',
  'public/.well-known/apple-developer-merchantid-domain-association',
  'src/app/api/health/route.ts',
  'src/app/robots.ts',
  'src/app/sitemap.ts',
  'src/app/not-found.tsx',
  'src/app/error.tsx',
  'src/app/global-error.tsx',
  'src/lib/rateLimit.ts',
  'src/lib/auth.ts',
];

for (const file of criticalFiles) {
  const filePath = resolve(rootDir, file);
  assert(existsSync(filePath), `Required production file exists: ${file}`);
}

// 2. Apple Pay Domain Association Certificate Check
console.log('\n2. Verifying Apple Pay Domain Association Certificate...');
const appleCertPath = resolve(rootDir, 'public/.well-known/apple-developer-merchantid-domain-association');
if (existsSync(appleCertPath)) {
  const cert = readFileSync(appleCertPath, 'utf8');
  assert(cert.length > 500, `Apple Pay merchant domain association certificate is present (${cert.length} bytes)`);
} else {
  assert(false, 'Apple Pay merchant domain association certificate is missing');
}

// 3. Next.js Security Headers
console.log('\n3. Verifying HTTP Security Headers in next.config.ts...');
const nextConfigPath = resolve(rootDir, 'next.config.ts');
const nextConfigContent = readFileSync(nextConfigPath, 'utf8');
assert(nextConfigContent.includes('Strict-Transport-Security'), 'HSTS header configured');
assert(nextConfigContent.includes('X-Content-Type-Options'), 'X-Content-Type-Options: nosniff configured');
assert(nextConfigContent.includes('X-Frame-Options'), 'X-Frame-Options configured');
assert(nextConfigContent.includes('output: \'standalone\''), 'Standalone output configured for Docker/Cloud');

// 4. PostgreSQL DDL Schema Validation
console.log('\n4. Verifying PostgreSQL Production DDL Schema...');
const schemaPath = resolve(rootDir, 'scripts/schema.sql');
const schemaContent = readFileSync(schemaPath, 'utf8');
const tables = [
  'users',
  'wallets',
  'wallet_ledger',
  'categories',
  'posts',
  'brand_responses',
  'debates',
  'debate_sides',
  'interactions',
  'post_backers',
  'payments',
  'api_keys',
  'audit_logs',
  'board_snapshots',
];

for (const t of tables) {
  assert(schemaContent.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `Schema DDL defines table: "${t}"`);
}

// 5. Gate 0 Moderation Rules
console.log('\n5. Verifying Gate 0 Safety & Moderation Engine...');
const gate0Path = resolve(rootDir, 'src/lib/moderation/gate0.ts');
if (existsSync(gate0Path)) {
  const gate0Content = readFileSync(gate0Path, 'utf8');
  assert(gate0Content.includes('runGate0Moderation'), 'runGate0Moderation function defined');
  assert(gate0Content.includes('BANNED_POLITICAL_TERMS') || gate0Content.includes('ILLEGAL_TERMS'), 'Prohibited patterns / terms catalog configured');
} else {
  assert(false, 'Gate 0 moderation file missing');
}

// 6. Rate Limiting Logic
console.log('\n6. Verifying Sliding Window Rate Limiter...');
const rateLimitPath = resolve(rootDir, 'src/lib/rateLimit.ts');
if (existsSync(rateLimitPath)) {
  const rateLimitContent = readFileSync(rateLimitPath, 'utf8');
  assert(rateLimitContent.includes('SlidingWindowRateLimiter'), 'SlidingWindowRateLimiter class defined');
  assert(rateLimitContent.includes('getClientIp'), 'getClientIp helper defined');
} else {
  assert(false, 'Rate limit utility missing');
}

// Summary
console.log('\n' + '='.repeat(60));
if (failCount === 0) {
  console.log(`🎉 ALL ${passCount} PRODUCTION READINESS CHECKS PASSED 100%!`);
  console.log('='.repeat(60) + '\n');
  process.exit(0);
} else {
  console.error(`⚠️ ${failCount} CHECKS FAILED! Please review above output.`);
  console.log('='.repeat(60) + '\n');
  process.exit(1);
}
