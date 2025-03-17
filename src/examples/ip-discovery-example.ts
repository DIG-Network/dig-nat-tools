/**
 * IP Discovery Example
 * 
 * This example demonstrates how to use the discoverPublicIPs function
 * to find your public IPv4 and IPv6 addresses, which is useful for
 * NAT traversal and peer-to-peer connections.
 */

import { discoverPublicIPs } from '../index';

async function main() {
  console.log('Starting public IP discovery...');
  console.log('This may take a few seconds...');
  
  try {
    // Discover public IPs with default settings
    const result = await discoverPublicIPs();
    
    console.log('\nDiscovery Results:');
    console.log('-----------------');
    console.log(`IPv4 Address: ${result.ipv4 || 'Not found'}`);
    console.log(`IPv6 Address: ${result.ipv6 || 'Not found'}`);
    
    // Provide some context about the results
    if (result.ipv4) {
      console.log('\nYour IPv4 address can be used for direct connections when:');
      console.log('- You have a public IPv4 address (no NAT)');
      console.log('- Your router supports UPnP or NAT-PMP for automatic port forwarding');
      console.log('- You manually configure port forwarding on your router');
    } else {
      console.log('\nNo public IPv4 address was found. This could mean:');
      console.log('- You are behind a strict NAT or firewall');
      console.log('- Your ISP does not provide a public IPv4 address');
      console.log('- The discovery services are temporarily unavailable');
    }
    
    if (result.ipv6) {
      console.log('\nYour IPv6 address can be used for direct connections when:');
      console.log('- Both peers have IPv6 connectivity');
      console.log('- Your firewall allows incoming connections');
      console.log('- IPv6 is not filtered by your ISP or network');
    } else {
      console.log('\nNo public IPv6 address was found. This could mean:');
      console.log('- Your ISP does not provide IPv6 connectivity');
      console.log('- IPv6 is disabled on your device or network');
      console.log('- The discovery services are temporarily unavailable');
    }
    
    console.log('\nFor NAT traversal in dig-nat-tools:');
    console.log('- WebRTC will be used when direct connections are not possible');
    console.log('- STUN servers help establish peer-to-peer connections');
    console.log('- Gun relay provides a fallback when all else fails');
    
  } catch (error) {
    console.error('Error discovering public IPs:', error);
  }
}

// Run the example
main().catch(console.error); 