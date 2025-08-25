// debug-gunjs.js - Step by step Gun.js debugging
import Gun from 'gun';

console.log('🧪 Gun.js Debug Test Starting...');
console.log('═══════════════════════════════════════');

// Test 1: Basic Gun.js connection
console.log('\n📡 Test 1: Basic Gun.js Connection');
console.log('Connecting to http://localhost:8765/gun...');

const gun = Gun(['http://localhost:8765/gun']);
console.log('✅ Gun instance created');

// Test 2: Write to registry
console.log('\n📝 Test 2: Write Test Data');
const testData = {
  storeId: 'debug-test-host',
  lastSeen: Date.now(),
  externalIp: 'localhost',
  port: 3001,
  directHttp_available: true,
  directHttp_ip: 'localhost',
  directHttp_port: 3001,
  webTorrent_available: true
};

console.log('Writing test data:', testData);

gun.get('dig-nat-tools-test')
   .get('hosts')
   .get('debug-test-host')
   .put(testData);

console.log('✅ Test data written to Gun.js');

// Test 3: Read back the data
console.log('\n📖 Test 3: Read Back Test Data');
setTimeout(() => {
  gun.get('dig-nat-tools-test')
     .get('hosts')
     .get('debug-test-host')
     .once((data) => {
       if (data) {
         console.log('✅ Successfully read back data:', data);
       } else {
         console.log('❌ Failed to read back data');
       }
     });
}, 1000);

// Test 4: List all hosts
console.log('\n📋 Test 4: List All Hosts');
setTimeout(() => {
  gun.get('dig-nat-tools-test')
     .get('hosts')
     .once((data) => {
       console.log('All hosts data:', data);
       if (data) {
         const hostKeys = Object.keys(data).filter(key => key !== '_');
         console.log(`Found ${hostKeys.length} host(s):`, hostKeys);
         hostKeys.forEach(key => {
           console.log(`  - ${key}:`, data[key]);
         });
       } else {
         console.log('❌ No hosts data found');
       }
     });
}, 2000);

// Test 5: Cleanup
setTimeout(() => {
  console.log('\n🧹 Test 5: Cleanup');
  gun.get('dig-nat-tools-test')
     .get('hosts')
     .get('debug-test-host')
     .put(null);
  console.log('✅ Test data cleaned up');
  
  console.log('\n🎯 Debug test completed!');
  console.log('If you see data being written and read successfully,');
  console.log('then Gun.js connectivity is working properly.');
  process.exit(0);
}, 3000);
