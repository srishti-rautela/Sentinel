const url = (env, port) => process.env[env] || `http://localhost:${port}`;
module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'sentinel-demo-secret',
  GATEWAY: url('GATEWAY_URL', 3000),
  INCIDENT: url('INCIDENT_URL', 4001),
  AI: url('AI_URL', 4002),
  POLICY: url('POLICY_URL', 4003),
  AUTH: url('AUTH_URL', 3001),
  PRODUCT: url('PRODUCT_URL', 3002),
  ORDER: url('ORDER_URL', 3003),
  CART: url('CART_URL', 3004),
  PAYMENT: url('PAYMENT_URL', 3005),
  NOTIFICATION: url('NOTIFICATION_URL', 3006),
};
