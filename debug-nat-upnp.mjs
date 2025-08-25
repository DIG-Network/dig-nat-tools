import natUpnp from 'nat-upnp';

console.log('nat-upnp exports:', natUpnp);
console.log('nat-upnp keys:', Object.keys(natUpnp));
console.log('nat-upnp.createClient:', natUpnp.createClient);
console.log('typeof natUpnp:', typeof natUpnp);
console.log('Is function:', typeof natUpnp === 'function');

// Try different ways to access createClient
try {
  console.log('natUpnp.createClient():', natUpnp.createClient());
} catch (e) {
  console.log('natUpnp.createClient() failed:', e.message);
}

try {
  console.log('natUpnp():', natUpnp());
} catch (e) {
  console.log('natUpnp() failed:', e.message);
}
