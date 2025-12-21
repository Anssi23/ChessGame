const { createProxyMiddleware } = require('http-proxy-middleware');
const env = process.env;

// Resolve backend URL: prefer REACT_APP_BACKEND_URL (CRA dev), then
// ASPNETCORE_URLS (when using dotnet SPA hosting), then fallback.
const target = env.REACT_APP_BACKEND_URL
  ? env.REACT_APP_BACKEND_URL
  : env.ASPNETCORE_URLS
    ? env.ASPNETCORE_URLS.split(';')[0]
    : 'http://localhost:5267';

// Proxy only API calls under /api to the backend. DO NOT proxy SignalR hub
// connections (/chesshub) so the client connects directly to backend negotiate.
const context = [
  '/api'
  //'/chesshub'
];

const onError = (err, req, resp) => {
  console.error('Proxy error:', err && err.message ? err.message : err);
};

module.exports = function (app) {
  console.log('[setupProxy] using target:', target);
  const appProxy = createProxyMiddleware(context, {
    proxyTimeout: 10000,
    target,
    changeOrigin: true,
    onError,
    secure: false,
    // do not proxy websockets for SignalR; client will connect to hub URL directly
    ws: false,
    logLevel: 'debug',
    headers: {
      Connection: 'Keep-Alive'
    }
  });

  app.use(appProxy);
};
