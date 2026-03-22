const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const path = require('path');

const app = express();

// Serve the UI from the root directory
app.use(express.static(path.join(__dirname, '../')));

app.use('/service', createProxyMiddleware({
    target: 'http://localhost',
    router: (req) => {
        // Extract the target URL from the path
        const targetParts = req.url.split('/').filter(p => p !== '');
        const targetUrl = targetParts.join('/');
        return targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
    },
    pathRewrite: (path) => '/',
    changeOrigin: true,
    followRedirects: true,
    selfHandleResponse: true, 
    onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
        const contentType = proxyRes.headers['content-type'] || '';
        
        if (contentType.includes('text/html')) {
            let html = responseBuffer.toString('utf8');
            
            // Resolve the target host for relative links
            let targetHost = '';
            try {
                const rawUrl = req.url.split('/').filter(p => p !== '').join('/');
                targetHost = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).origin;
            } catch (e) {
                targetHost = '';
            }

            // Rewrite links to stay within the /service/ proxy
            html = html.replace(/(src|href|action)="(?!mailto|javascript|#|data:)([^"]+)"/g, (match, p1, p2) => {
                let absoluteUrl = p2;
                if (!p2.startsWith('http') && targetHost) {
                    try {
                        absoluteUrl = new URL(p2, targetHost).href;
                    } catch (e) {
                        absoluteUrl = p2;
                    }
                }
                return `${p1}="/service/${absoluteUrl}"`;
            });

            return html;
        }

        return responseBuffer;
    }),
    on: {
        proxyRes: (proxyRes) => {
            // Remove security headers to allow iframing
            delete proxyRes.headers['x-frame-options'];
            delete proxyRes.headers['content-security-policy'];
            delete proxyRes.headers['content-security-policy-report-only'];
            delete proxyRes.headers['permissions-policy'];
        },
        error: (err, req, res) => {
            res.status(500).send('Prophetin: Target unreachable or diseased.');
        }
    }
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

module.exports = app;
