// server.js - Shakt App Local & Network Server

// Zero external dependencies - pure Node.js standard library
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOGS_DIR = path.join(__dirname, 'logs');

// ============================================================================
// COMPREHENSIVE LOGGING SYSTEM
// ============================================================================

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Log file paths
const LOG_FILES = {
  all: path.join(LOGS_DIR, 'all.log'),
  requests: path.join(LOGS_DIR, 'requests.log'),
  errors: path.join(LOGS_DIR, 'errors.log'),
  claude: path.join(LOGS_DIR, 'claude-api.log'),
  server: path.join(LOGS_DIR, 'server.log')
};

// Logging utility
function log(level, category, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    category,
    message,
    ...(data && { data })
  };

  const logLine = JSON.stringify(logEntry) + '\n';

  // Write to all.log
  fs.appendFileSync(LOG_FILES.all, logLine);

  // Write to category-specific log
  if (LOG_FILES[category]) {
    fs.appendFileSync(LOG_FILES[category], logLine);
  }

  // Write errors to error log
  if (level === 'ERROR' || level === 'WARN') {
    fs.appendFileSync(LOG_FILES.errors, logLine);
  }

  // Console output with colors
  const colors = {
    INFO: '\x1b[36m',    // Cyan
    WARN: '\x1b[33m',    // Yellow
    ERROR: '\x1b[31m',   // Red
    SUCCESS: '\x1b[32m', // Green
    DEBUG: '\x1b[90m'    // Gray
  };
  const reset = '\x1b[0m';
  const color = colors[level] || '';

  console.log(`${color}[${timestamp}] [${level}] [${category}]${reset} ${message}`);
  if (data) {
    console.log(`${color}${JSON.stringify(data, null, 2)}${reset}`);
  }
}

// Enhanced logging for debugging
log('INFO', 'server', 'Server starting...');
log('DEBUG', 'server', 'Environment info', {
  nodeVersion: process.version,
  platform: process.platform,
  cwd: process.cwd(),
  pid: process.pid
});

// Optional .env loading
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      });
      log('SUCCESS', 'server', 'Loaded .env file');
    } catch (e) {
      log('WARN', 'server', 'Could not read .env file', { error: e.message });
    }
  }
}
loadEnv();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

function handleClaudeProxy(req, res) {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  log('INFO', 'claude', `Incoming Claude API request [${requestId}]`, {
    method: req.method,
    url: req.url,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']
    }
  });

  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 25 * 1024 * 1024) { // 25MB limit for high-res note images
      log('ERROR', 'claude', `Payload too large [${requestId}]`, { size: body.length });
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Payload too large' }));
      req.destroy();
    }
  });

  req.on('end', () => {
    try {
      const parsed = JSON.parse(body || '{}');
      log('DEBUG', 'claude', `Request parsed [${requestId}]`, {
        model: parsed.model,
        maxTokens: parsed.max_tokens,
        messageCount: parsed.messages?.length
      });

      const apiKey = parsed.apiKey || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;

      if (!apiKey) {
        log('ERROR', 'claude', `No API key provided [${requestId}]`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'No Anthropic API key provided. Set ANTHROPIC_AUTH_TOKEN or input it in Shakt settings.'
        }));
        return;
      }

      // Intelligent model routing:
      // If client asked for a standard claude-3-x model but local omni-route / proxy is configured,
      // route to the configured environment model (e.g. omni-route) to prevent provider_not_configured errors.
      const envModel = process.env.ANTHROPIC_MODEL;
      let model = parsed.model;
      if (envModel && (process.env.ANTHROPIC_BASE_URL || !model || model.startsWith('claude-3-'))) {
        model = envModel;
      } else if (!model) {
        model = envModel || 'omni-route';
      }

      const payload = {
        model: model,
        max_tokens: parsed.max_tokens || 4000,
        messages: parsed.messages
      };

      // Prompt Caching Optimization: Enable ephemeral caching on system prompt
      // Reduces input token costs by up to 90% on repeated turns
      if (parsed.system) {
        if (typeof parsed.system === 'string') {
          payload.system = [
            {
              type: 'text',
              text: parsed.system,
              cache_control: { type: 'ephemeral' }
            }
          ];
        } else {
          payload.system = parsed.system;
        }
      }

      const postData = JSON.stringify(payload);
      log('DEBUG', 'claude', `Sending to Anthropic API [${requestId}]`, {
        model,
        payloadSize: postData.length
      });

      // Support custom ANTHROPIC_BASE_URL (e.g. local proxy or custom gateway)
      const baseUrlStr = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
      const parsedBaseUrl = new URL(baseUrlStr);
      const isHttps = parsedBaseUrl.protocol === 'https:';
      const requestLib = isHttps ? https : http;
      const targetPort = parsedBaseUrl.port || (isHttps ? 443 : 80);
      const targetPath = (parsedBaseUrl.pathname ? parsedBaseUrl.pathname.replace(/\/$/, '') : '') + '/v1/messages';

      const anthropicReq = requestLib.request({
        hostname: parsedBaseUrl.hostname,
        port: targetPort,
        path: targetPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'x-api-key': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31'
        }
      }, (anthropicRes) => {
        log('INFO', 'claude', `Response from Anthropic [${requestId}]`, {
          statusCode: anthropicRes.statusCode,
          headers: anthropicRes.headers
        });

        let responseBody = '';
        anthropicRes.on('data', chunk => { responseBody += chunk; });
        anthropicRes.on('end', () => {
          let parsedData = null;
          try {
            parsedData = JSON.parse(responseBody);
          } catch (_) {}

          if (anthropicRes.statusCode >= 400) {
            const errorMsg = parsedData?.error?.message || parsedData?.message || parsedData?.error || responseBody || 'Upstream API error';
            log('WARN', 'claude', `Anthropic error [${requestId}]`, {
              statusCode: anthropicRes.statusCode,
              error: errorMsg
            });
            res.writeHead(anthropicRes.statusCode, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ error: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg) }));
            return;
          }

          if (parsedData) {
            log('SUCCESS', 'claude', `Request completed [${requestId}]`, {
              statusCode: anthropicRes.statusCode,
              usage: parsedData.usage,
              stopReason: parsedData.stop_reason
            });
          }

          res.writeHead(anthropicRes.statusCode, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(responseBody);
        });
      });

      anthropicReq.on('error', (err) => {
        log('ERROR', 'claude', `Anthropic upstream error [${requestId}]`, {
          error: err.message,
          stack: err.stack
        });
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Anthropic upstream error: ' + err.message }));
      });

      anthropicReq.write(postData);
      anthropicReq.end();

    } catch (err) {
      log('ERROR', 'claude', `Invalid JSON request [${requestId}]`, {
        error: err.message,
        stack: err.stack
      });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON request: ' + err.message }));
    }
  });
}

function handlePythonAction(req, res) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 50 * 1024 * 1024) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Payload too large (50MB max)' }));
      req.destroy();
    }
  });

  req.on('end', () => {
    try {
      const pythonScript = path.join(__dirname, 'python_engine', 'pdf_service.py');
      const pyProc = spawn('python3', [pythonScript, 'stdin']);

      let stdoutData = '';
      let stderrData = '';

      pyProc.stdout.on('data', chunk => { stdoutData += chunk; });
      pyProc.stderr.on('data', chunk => { stderrData += chunk; });

      pyProc.on('close', code => {
        if (code !== 0) {
          log('ERROR', 'python', 'Python execution failed', { code, stderr: stderrData });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: stderrData || 'Python execution failed' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(stdoutData);
        }
      });

      pyProc.on('error', err => {
        log('ERROR', 'python', 'Failed to spawn Python process', { error: err.message });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });

      pyProc.stdin.write(body);
      pyProc.stdin.end();

    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

function handlePythonStatus(req, res) {
  const pythonScript = path.join(__dirname, 'python_engine', 'pdf_service.py');
  const pyProc = spawn('python3', [pythonScript, 'status']);
  let stdoutData = '';
  pyProc.stdout.on('data', chunk => { stdoutData += chunk; });
  pyProc.on('close', code => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(stdoutData || JSON.stringify({ status: 'unknown' }));
  });
  pyProc.on('error', err => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', error: err.message }));
  });
}

const server = http.createServer((req, res) => {
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const requestStart = Date.now();

  // Log all incoming requests
  log('INFO', 'requests', `Incoming request [${requestId}]`, {
    method: req.method,
    url: req.url,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
      'referer': req.headers['referer']
    },
    ip: req.socket.remoteAddress
  });

  // CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');

  if (req.method === 'OPTIONS') {
    log('DEBUG', 'requests', `OPTIONS preflight [${requestId}]`, { url: req.url });
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // API Endpoints
  if (pathname === '/api/claude' && req.method === 'POST') {
    log('INFO', 'requests', `Claude API endpoint hit [${requestId}]`);
    return handleClaudeProxy(req, res);
  }

  if (pathname === '/api/py/status' && req.method === 'GET') {
    return handlePythonStatus(req, res);
  }

  if (pathname === '/api/py/action' && req.method === 'POST') {
    return handlePythonAction(req, res);
  }

  if (pathname === '/api/config' && req.method === 'GET') {
    log('INFO', 'requests', `Config endpoint hit [${requestId}]`);
    const configData = {
      hasServerApiKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      defaultModel: process.env.ANTHROPIC_MODEL || 'omni-route',
      activeModel: process.env.ANTHROPIC_MODEL || 'omni-route',
      platform: process.platform,
      networkIps: getNetworkAddresses(),
      port: PORT
    };
    log('DEBUG', 'requests', `Config response [${requestId}]`, configData);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(configData));
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  const normalizedPath = path.normalize(filePath);

  log('DEBUG', 'requests', `Static file request [${requestId}]`, {
    requestedPath: pathname,
    resolvedPath: normalizedPath
  });

  if (!normalizedPath.startsWith(PUBLIC_DIR)) {
    log('WARN', 'requests', `Path traversal attempt blocked [${requestId}]`, {
      requestedPath: pathname,
      normalizedPath
    });
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(normalizedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      // If file not found, try index.html for SPA support
      log('DEBUG', 'requests', `File not found, trying fallback [${requestId}]`, { path: normalizedPath });
      const fallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(fallback, (fallbackErr, content) => {
        if (fallbackErr) {
          log('ERROR', 'requests', `404 Not Found [${requestId}]`, {
            path: pathname,
            duration: Date.now() - requestStart
          });
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        } else {
          log('SUCCESS', 'requests', `Served fallback index.html [${requestId}]`, {
            duration: Date.now() - requestStart
          });
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        }
      });
      return;
    }

    const ext = path.extname(normalizedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Cache-Control headers
    if (ext === '.html' || ext === '.json') {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }

    log('SUCCESS', 'requests', `Serving static file [${requestId}]`, {
      path: pathname,
      size: stats.size,
      contentType,
      duration: Date.now() - requestStart
    });

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(normalizedPath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getNetworkAddresses();

  log('SUCCESS', 'server', 'Server started successfully', {
    port: PORT,
    publicDir: PUBLIC_DIR,
    logsDir: LOGS_DIR,
    networkIps: ips,
    apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    defaultModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'
  });

  console.log('========================================================');
  console.log('⚡ SHAKT (शक्ति) Note & Study Companion is running! ⚡');
  console.log('========================================================');
  console.log(`💻 Linux / Local Browser: http://localhost:${PORT}`);
  if (ips.length > 0) {
    console.log(`📱 Android Phone / Tablet (same Wi-Fi):`);
    ips.forEach(ip => console.log(`   http://${ip}:${PORT}`));
  }
  console.log('========================================================');
  console.log(`📝 Logs directory: ${LOGS_DIR}`);
  console.log(`   - all.log: All logs combined`);
  console.log(`   - requests.log: HTTP requests`);
  console.log(`   - claude-api.log: Claude API calls`);
  console.log(`   - errors.log: Errors and warnings`);
  console.log(`   - server.log: Server events`);
  console.log('========================================================');
  console.log(`API Key status: ${process.env.ANTHROPIC_API_KEY ? 'Configured from Environment' : 'Not set in env (Enter in App Settings)'}`);
  console.log('Press Ctrl+C to stop.');
});

// Handle server errors
server.on('error', (err) => {
  log('ERROR', 'server', 'Server error', {
    error: err.message,
    code: err.code,
    stack: err.stack
  });
});

// Handle process errors
process.on('uncaughtException', (err) => {
  log('ERROR', 'server', 'Uncaught exception', {
    error: err.message,
    stack: err.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('ERROR', 'server', 'Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  log('INFO', 'server', 'Received SIGINT, shutting down gracefully');
  server.close(() => {
    log('SUCCESS', 'server', 'Server closed successfully');
    process.exit(0);
  });
});
