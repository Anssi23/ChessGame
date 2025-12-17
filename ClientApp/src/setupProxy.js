const { createProxyMiddleware } = require('http-proxy-middleware');
const env = process.env;

// Default to the backend HTTPS URL that the ASP.NET app prints when it starts.
// You can override by setting ASPNETCORE_HTTPS_PORT or ASPNETCORE_URLS in env.
const target = env.ASPNETCORE_HTTPS_PORT
    ? `https://localhost:44409`//${env.ASPNETCORE_HTTPS_PORT}
  : env.ASPNETCORE_URLS
    ? env.ASPNETCORE_URLS.split(';')[0]
    : 'https://localhost:7124';

// Proxy any API calls under /api to the backend
const context = [
  '/api',
  '/chesshub'
];

const onError = (err, req, resp) => {
  console.error('Proxy error:', err && err.message ? err.message : err);
};

module.exports = function (app) {
  console.log('[setupProxy] using target:', target);
  const appProxy = createProxyMiddleware(context, {
    proxyTimeout: 10000,
    target: target,
    changeOrigin: true,
    onError: onError,
    secure: false,
    ws: true,
    headers: {
      Connection: 'Keep-Alive'
    }
  });

  app.use(appProxy);
};
