/**
 * Application Module
 * 
 * This module provides application-layer functionalities for the Dig NAT Tools system.
 * It includes components that build on the lower-level networking and crypto primitives
 * to create usable interfaces for applications.
 */

// Export authenticated file host
export * from './authenticated-file-host';

// Export authenticated content availability manager
export * from './authenticated-content-availability-manager';

// Export other application components as they are created