// Manual Gun.js data query tool using proper WebSocket connections
import Gun from 'gun';

async function queryGunData() {
  console.log('🔍 Manual Gun.js WebSocket Query Tool');
  console.log('━'.repeat(50));
  
  // Initialize Gun.js with your relay (using the correct port)
  const gun = Gun({
    peers: ['http://nostalgiagame.go.ro:30878/gun'], // Using port 30878 like your relay
    retry: 1000,
    timeout: 15000,
    localStorage: false // Disable to avoid local cache interference
  });

  console.log('🔗 Connecting to Gun.js relay: http://nostalgiagame.go.ro:30878/gun');
  console.log('⏳ Waiting for WebSocket connection to establish...\n');

  // Wait for connection to establish
  await new Promise(resolve => setTimeout(resolve, 3000));

  return new Promise((resolve) => {
    let hasReceivedData = false;
    
    // Set a timeout to resolve if no data is received
    const timeout = setTimeout(() => {
      if (!hasReceivedData) {
        console.log('⏰ Timeout reached - no data received from Gun.js');
        console.log('This could mean:');
        console.log('  • The relay is not accessible');
        console.log('  • No data exists in the namespace');
        console.log('  • Network/firewall issues');
        resolve();
      }
    }, 10000);

    // Query the namespace root
    console.log('📊 Querying namespace root: dig-nat-tools-test');
    gun.get('dig-nat-tools-test').once((data) => {
      hasReceivedData = true;
      clearTimeout(timeout);
      
      console.log('📋 Namespace root data received:');
      console.log('  Raw data:', JSON.stringify(data, null, 2));
      
      if (data) {
        const keys = Object.keys(data).filter(key => key !== '_');
        console.log('  Keys (excluding Gun.js metadata):', keys);
        
        if (keys.includes('hosts')) {
          console.log('\n🏠 Found hosts key! Querying hosts data...');
          
          // Query hosts data
          gun.get('dig-nat-tools-test').get('hosts').once((hostsData) => {
            console.log('📋 Hosts data received:');
            console.log('  Raw hosts data:', JSON.stringify(hostsData, null, 2));
            
            if (hostsData) {
              const hostKeys = Object.keys(hostsData).filter(key => key !== '_');
              console.log('  Host keys:', hostKeys);
              
              // Query each individual host
              let processedHosts = 0;
              hostKeys.forEach((hostKey, index) => {
                console.log(`\n🔍 Querying individual host: ${hostKey}`);
                
                gun.get('dig-nat-tools-test').get('hosts').get(hostKey).once((hostData) => {
                  console.log(`📄 Host ${hostKey} data:`, JSON.stringify(hostData, null, 2));
                  
                  processedHosts++;
                  if (processedHosts === hostKeys.length) {
                    console.log('\n✅ All hosts processed');
                    resolve();
                  }
                });
              });
              
              if (hostKeys.length === 0) {
                console.log('❌ No host keys found in hosts data');
                resolve();
              }
            } else {
              console.log('❌ No hosts data received');
              resolve();
            }
          });
        } else {
          console.log('❌ No "hosts" key found in namespace');
          resolve();
        }
      } else {
        console.log('❌ No data received for namespace');
        resolve();
      }
    });

    // Also listen for real-time updates
    console.log('\n👂 Listening for real-time updates...');
    gun.get('dig-nat-tools-test').on((data, key) => {
      console.log(`🔔 Real-time update received - Key: ${key}`);
      console.log('   Data:', JSON.stringify(data, null, 2));
    });
  });
}

// Run the query
queryGunData()
  .then(() => {
    console.log('\n✅ Manual query complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error during query:', error);
    process.exit(1);
  });