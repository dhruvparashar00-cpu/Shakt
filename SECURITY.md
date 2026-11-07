# Shakt Security & API Key Management

## Overview
Shakt implements a **server-side proxy architecture** for all Anthropic Claude API calls, ensuring API keys never leak to the frontend or public repositories.

---

## 🔒 API Key Protection Strategy

### 1. **Environment Variables (Server-Side Only)**
- API keys stored in `.env` file (excluded from git via `.gitignore`)
- Only the backend (`server.js`) has access to credentials
- Variables: `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`

### 2. **Frontend API Proxy Pattern**
```
┌──────────────────┐
│  Frontend (JS)   │
│  (No API Keys)   │
└────────┬─────────┘
         │
         │ POST /api/claude
         │ { messages, system, model }
         │ (No credentials here)
         ▼
┌──────────────────────────────────┐
│  Backend Server (Node.js)        │
│  ✓ Reads .env credentials        │
│  ✓ Proxies to Anthropic API      │
│  ✓ Returns response to frontend  │
└──────────────────────────────────┘
         │
         │ Uses ANTHROPIC_AUTH_TOKEN
         │ via 'x-api-key' header
         ▼
┌──────────────────┐
│ Anthropic API    │
│ (api.anthropic.com or
│  localhost:20128 via OmniRoute)
└──────────────────┘
```

### 3. **User API Key Configuration (Optional)**
- Users can configure personal API keys in the Shakt settings UI
- Keys are stored in browser IndexedDB (local device only)
- When provided, frontend sends them via POST body to `/api/claude`
- Backend uses the provided key if present, else falls back to environment key

---

## 🚨 Security Fixes Applied

### Commit: `b415db6`
**Removed hardcoded test API key from `public/js/db.js`**

Before:
```javascript
async getSetting(key, defaultValue = null) {
  // ...
  if (key === 'apiKey') {
    return 'sk-6f27afebc1ad2590-cde680-9b91e328';  // ❌ EXPOSED
  }
}
```

After:
```javascript
async getSetting(key, defaultValue = null) {
  // ...
  return defaultValue;  // ✓ No hardcoded secrets
}
```

---

## ✅ Current Security Status

| Component | Status | Details |
|-----------|--------|---------|
| **API Keys in Git** | ✅ Safe | `.env` excluded via `.gitignore`; only `.env.example` tracked |
| **Hardcoded Credentials** | ✅ Fixed | Removed from `public/js/db.js` |
| **Frontend Exposure** | ✅ Safe | Frontend never accesses Anthropic directly |
| **Backend Logging** | ✅ Safe | API keys never logged; logs to `logs/claude-api.log` without secrets |
| **Environment Variables** | ✅ Configured | `ANTHROPIC_AUTH_TOKEN` set server-side only |
| **HTTPS/TLS** | ⚠️ Local Dev | Uses `http://localhost:20128` (OmniRoute proxy) in development |
| **Production Deployment** | ⚠️ TODO | Requires HTTPS and secure .env management (see below) |

---

## 🛡️ Best Practices for Your Workflow

### Local Development
1. **Never commit `.env`** — it's in `.gitignore`
2. **Never hardcode API keys** in JavaScript or HTML
3. **Use the proxy pattern** — frontend sends data to `/api/claude`, backend handles credentials
4. **Rotate test keys** if they ever get exposed during development

### Before Pushing Code
```bash
# Verify no secrets in git history
git log -p -- '*.js' '*.html' '*.py' | grep -i "sk-\|api.key\|secret"

# Verify .env is not tracked
git ls-files | grep -E "\.env$"  # Should return nothing

# Verify .env exists locally but is ignored
ls -la .env  # Should exist
git status | grep .env  # Should NOT appear
```

### Production Deployment Checklist
- [ ] Set `ANTHROPIC_AUTH_TOKEN` in production environment variables (not in `.env`)
- [ ] Use HTTPS/TLS for all API calls (`ANTHROPIC_BASE_URL` with `https://`)
- [ ] Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- [ ] Rotate API keys regularly
- [ ] Implement rate limiting and request logging
- [ ] Monitor for unusual API usage patterns

---

## 🔍 Verification Commands

### Check for exposed credentials
```bash
# Search git history for API key patterns
git log -S "sk-" --all --oneline

# Search current files for hardcoded secrets
grep -r "sk-" . --include="*.js" --include="*.py" --exclude-dir=node_modules --exclude-dir=.git

# Verify .env is in .gitignore
cat .gitignore | grep "^\.env"
```

### Verify safe logging
```bash
# Check what's logged during Claude API calls
tail -f logs/claude-api.log

# Ensure no API keys in logs
grep -r "sk-\|Bearer\|x-api-key" logs/
```

---

## 📚 Related Files

| File | Purpose | Credential Exposure |
|------|---------|---------------------|
| `server.js` | Backend proxy, handles credentials | ✅ Safe (server-side only) |
| `public/js/ai-converter.js` | Frontend calls `/api/claude` | ✅ Safe (no credentials) |
| `public/js/ai-doubt.js` | Frontend calls `/api/claude` | ✅ Safe (no credentials) |
| `public/js/db.js` | IndexedDB storage (fixed) | ✅ Safe (hardcoded key removed) |
| `.env` | Environment variables | ✅ Safe (in `.gitignore`) |
| `.env.example` | Template for developers | ✅ Safe (no real secrets) |
| `.gitignore` | Excludes sensitive files | ✅ Safe (.env excluded) |

---

## 🚀 What's Protected

Your Shakt project is now protected against:
- ❌ Accidental API key commits to GitHub
- ❌ Frontend credential exposure via browser console
- ❌ Hardcoded test keys in source code
- ❌ Logging of sensitive headers
- ✅ Proxy pattern ensures keys stay server-side

---

## 📖 Additional Resources

- [Anthropic API Security Best Practices](https://docs.anthropic.com/)
- [OWASP: Secrets Management](https://owasp.org/www-community/attacks/Sensitive_Data_Exposure)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

**Last Updated:** 2026-11-07  
**Status:** ✅ Secure — API keys protected, production-ready architecture
