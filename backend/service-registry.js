'use strict';
// Trusted registry of Docker-network services that Sentinel may monitor.
//
// SECURITY MODEL
//  * The public-URL validator in server.js is untouched: it still rejects localhost / private addresses.
//  * Internal monitoring is a SEPARATE path. Its targets come only from this server-side file (or the file
//    named by SERVICE_REGISTRY_FILE). No API endpoint accepts a URL from a user, so it cannot be used as an SSRF
//    primitive against arbitrary internal hosts.
//  * Every health URL must point at a single-label Docker DNS name (e.g. "products") or a host explicitly listed in
//    TRUSTED_INTERNAL_HOSTS, and must be plain http(s) without credentials.
const fs = require('fs');

const DEFAULT_REGISTRY = {
  stacks: [
    {
      id: 'tilda-goods',
      projectName: 'Tilda Goods E-commerce',
      description: 'Tilda Goods storefront running as five independent Docker microservices behind an API gateway.',
      storefrontUrl: 'http://localhost:5174',
      gatewayUrl: 'http://localhost:5000',
      services: [
        {
          key: 'gateway', name: 'API Gateway', type: 'API Gateway', container: 'tilda-gateway', composeService: 'gateway',
          healthUrl: 'http://gateway:5000/api/health', severity: 'critical',
          incidentDescription: 'API Gateway is unavailable. E-commerce API requests cannot reach backend services.',
          impact: 'Every storefront API request fails; customers cannot browse, sign in or order.'
        },
        {
          key: 'auth', name: 'Authentication Service', type: 'Authentication', container: 'tilda-auth', composeService: 'auth',
          healthUrl: 'http://auth:5001/health', severity: 'high',
          incidentDescription: 'Authentication Service is unavailable. Login and registration requests are failing.',
          impact: 'Customers and admins cannot register or sign in; existing sessions may fail validation.'
        },
        {
          key: 'products', name: 'Product Service', type: 'Catalogue', container: 'tilda-products', composeService: 'products',
          healthUrl: 'http://products:5002/health', severity: 'high',
          incidentDescription: 'Product Service is unreachable. Product listing and product search may be unavailable.',
          impact: 'Product listing, search, product details and admin product management are unavailable.'
        },
        {
          key: 'orders', name: 'Order Service', type: 'Orders & Checkout', container: 'tilda-orders', composeService: 'orders',
          healthUrl: 'http://orders:5003/health', severity: 'critical',
          incidentDescription: 'Order Service is unavailable. Customers may be unable to complete checkout.',
          impact: 'Checkout, order history and order management are unavailable; revenue is directly affected.'
        },
        {
          key: 'media', name: 'Media Service', type: 'Media & Uploads', container: 'tilda-media', composeService: 'media',
          healthUrl: 'http://media:5004/health', severity: 'medium',
          incidentDescription: 'Media Service is unavailable. Image uploads and media delivery may be affected.',
          impact: 'Admin image uploads and uploaded product images are unavailable; the catalogue itself still works.'
        }
      ]
    }
  ]
};

function loadRegistry(env = process.env) {
  let registry = DEFAULT_REGISTRY;
  if (env.SERVICE_REGISTRY_FILE) registry = JSON.parse(fs.readFileSync(env.SERVICE_REGISTRY_FILE, 'utf8'));
  const extraHosts = new Set(String(env.TRUSTED_INTERNAL_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  for (const stack of registry.stacks) {
    if (!/^[a-z0-9-]+$/.test(stack.id)) throw new Error(`Invalid stack id: ${stack.id}`);
    for (const svc of stack.services) {
      if (!/^[a-z]+$/.test(svc.key)) throw new Error(`Invalid service key: ${svc.key}`);
      const u = new URL(svc.healthUrl);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error(`Untrusted health URL for ${svc.key}`);
      const host = u.hostname.toLowerCase();
      if (!(/^[a-z][a-z0-9-]*$/.test(host) || extraHosts.has(host))) throw new Error(`Health host "${host}" for ${svc.key} is not a Docker service name or a TRUSTED_INTERNAL_HOSTS entry.`);
    }
  }
  return registry;
}

module.exports = { loadRegistry, DEFAULT_REGISTRY };
