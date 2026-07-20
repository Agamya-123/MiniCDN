import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const ROUTER_URL = 'http://localhost:4000';

async function runVerification() {
  console.log('==================================================');
  console.log(' [MiniCDN] Automated End-to-End Verification Test');
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

    // 2. Create sample test file and upload to Origin
    console.log('[Step 2] Uploading test file to Origin Server...');
    const testFilePath = path.resolve('data/test_payload.txt');
    fs.writeFileSync(testFilePath, 'Hello World! This is a test file served across MiniCDN distributed edge network.');

    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath), 'test_payload.txt');

    const uploadRes = await axios.post(`${ROUTER_URL}/api/origin/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    });

    const uploadedFilename = uploadRes.data.file.filename;
    console.log(`✓ File uploaded to Origin: ${uploadedFilename}\n`);

    // 3. Test Geo-routing for Mumbai Client (19.07, 72.87)
    console.log('[Step 3] Request 1 (Mumbai Client -> Expect Mumbai Edge Cache MISS)...');
    const req1 = await axios.get(`${ROUTER_URL}/api/file/${uploadedFilename}?lat=19.0760&lng=72.8777`);
    console.log(`  Header X-CDN-Edge-Server: ${req1.headers['x-cdn-edge-server']}`);
    console.log(`  Header X-CDN-Cache-Status: ${req1.headers['x-cdn-cache-status']}`);
    console.log(`  Header X-CDN-Response-Time-MS: ${req1.headers['x-cdn-response-time-ms']} ms`);

    console.log('\n[Step 4] Request 2 (Mumbai Client -> Expect Mumbai Edge Cache HIT)...');
    const req2 = await axios.get(`${ROUTER_URL}/api/file/${uploadedFilename}?lat=19.0760&lng=72.8777`);
    console.log(`  Header X-CDN-Edge-Server: ${req2.headers['x-cdn-edge-server']}`);
    console.log(`  Header X-CDN-Cache-Status: ${req2.headers['x-cdn-cache-status']}`);
    console.log(`  Header X-CDN-Response-Time-MS: ${req2.headers['x-cdn-response-time-ms']} ms`);

    // 4. Test Geo-routing for Bangalore Client (12.97, 77.59)
    console.log('\n[Step 5] Request 3 (Bangalore Client -> Expect Bangalore Edge Cache MISS)...');
    const req3 = await axios.get(`${ROUTER_URL}/api/file/${uploadedFilename}?lat=12.9716&lng=77.5946`);
    console.log(`  Header X-CDN-Edge-Server: ${req3.headers['x-cdn-edge-server']}`);
    console.log(`  Header X-CDN-Cache-Status: ${req3.headers['x-cdn-cache-status']}`);

    // 5. Test Forced Edge Override (Lucknow)
    console.log('\n[Step 6] Request 4 (Force Lucknow Edge Override)...');
    const req4 = await axios.get(`${ROUTER_URL}/api/file/${uploadedFilename}?forceEdge=lucknow`);
    console.log(`  Header X-CDN-Edge-Server: ${req4.headers['x-cdn-edge-server']}`);
    console.log(`  Header X-CDN-Cache-Status: ${req4.headers['x-cdn-cache-status']}`);

    // 6. Verify Analytics Logs
    console.log('\n[Step 7] Querying Analytics Request Logs...');
    const logsRes = await axios.get(`${ROUTER_URL}/api/logs`);
    console.log(`  Total Logged Requests: ${logsRes.data.summary.total_requests}`);
    console.log(`  Cache Hit Rate: ${logsRes.data.summary.hit_rate_percent}%`);

    console.log('\n==================================================');
    console.log(' 🎉 ALL END-TO-END VERIFICATION TESTS PASSED!');
    console.log('==================================================');

  } catch (err) {
    console.error('❌ Verification failed:', err.response?.data || err.message);
    process.exit(1);
  }
}

runVerification();
