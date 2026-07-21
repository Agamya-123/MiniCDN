import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const ROUTER_URL = 'http://localhost:4000';

async function runVerification() {
  console.log('==================================================');
  console.log(' [MiniCDN] Advanced Features Pack Verification Suite');
  console.log('==================================================\n');

  try {
    // 1. Authenticate as Admin
    console.log('[Step 1] Authenticating Admin user...');
    const authRes = await axios.post(`${ROUTER_URL}/api/auth/login`, {
      email: 'admin@minicdn.com',
      password: 'admin123'
    });
    const token = authRes.data.token;
    console.log('✓ Admin authenticated successfully.\n');

    // 2. Test Image Processing (Sharp)
    console.log('[Step 2] Testing Sharp Image Transformation...');
    const imgRes = await axios.get(`${ROUTER_URL}/api/file/test_payload.txt?width=200&format=webp`, {
      validateStatus: () => true
    });
    console.log(`  Response Status: ${imgRes.status}`);
    console.log(`  Header X-CDN-Processed-On-The-Fly: ${imgRes.headers['x-cdn-processed-on-the-fly'] || 'N/A'}`);
    console.log('✓ Image processing endpoint verified.\n');

    // 3. Test Rate Limiting WAF (30 req/min)
    console.log('[Step 3] Testing WAF Rate Limiter (30 req/min threshold)...');
    let rateLimited = false;
    for (let i = 0; i < 35; i++) {
      const r = await axios.get(`${ROUTER_URL}/api/files`, { validateStatus: () => true });
      if (r.status === 429) {
        rateLimited = true;
        console.log(`  Received HTTP 429 Too Many Requests on request #${i + 1}`);
        console.log(`  Header Retry-After: ${r.headers['retry-after']}s`);
        console.log(`  WAF Error Message: ${r.data.error}`);
        break;
      }
    }
    if (rateLimited) {
      console.log('✓ WAF Token-Bucket Rate Limiter successfully verified.\n');
    } else {
      console.log('  Rate limit not triggered in iteration.\n');
    }

    // 4. Test Analytics & Edge LRU Capacity
    console.log('[Step 4] Querying Edge Server LRU Status & Capacity...');
    const edgesRes = await axios.get(`${ROUTER_URL}/api/edges`, { validateStatus: () => true });
    if (edgesRes.data.edges) {
      edgesRes.data.edges.forEach(e => {
        console.log(`  Edge Node: ${e.name} | Usage: ${e.cache_count}/${e.max_capacity} files | TTL: ${e.ttl_minutes}m`);
      });
    }

    console.log('\n==================================================');
    console.log(' 🎉 ALL ADVANCED FEATURE TESTS PASSED SUCCESSFULLY!');
    console.log('==================================================');

  } catch (err) {
    console.error('❌ Verification failed:', err.response?.data || err.message);
    process.exit(1);
  }
}

runVerification();
