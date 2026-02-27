# Authentication System Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FCP Workbench Auth System                     │
│                                                                       │
│  ┌─────────────────────┐          ┌──────────────────────────┐     │
│  │   Solo Mode         │          │      Team Mode            │     │
│  │                     │          │                           │     │
│  │  • No login needed  │   OR     │  • Login required         │     │
│  │  • Bypass button    │          │  • Multi-user             │     │
│  │  • Single admin     │          │  • Role-based access      │     │
│  └─────────────────────┘          └──────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

## Authentication Flow

### Standard Login Flow

```
┌────────────┐         ┌──────────────┐         ┌──────────────┐
│            │  POST   │              │  Verify │              │
│   Browser  ├────────>│  Auth Route  ├────────>│   Database   │
│            │ username│              │ password│              │
│            │ password│              │         │              │
└─────┬──────┘         └───────┬──────┘         └──────────────┘
      │                        │
      │                        │ Generate JWT
      │                        │ Store session
      │                        v
      │                ┌──────────────┐
      │<───────────────┤  JWT Token   │
      │   Return       │  + User Info │
      │                └──────────────┘
      │
      │ Store in localStorage
      v
┌────────────┐
│ Authorized │
│   Session  │
└────────────┘
```

### OAuth Flow

```
┌─────────┐         ┌──────────┐         ┌──────────────┐         ┌─────────┐
│ Browser │ Click   │  Server  │ Redirect│   Provider   │ OAuth   │Database │
│         ├────────>│  /auth/  ├────────>│   (Google/   │ callback│         │
│         │ OAuth   │  google  │         │   GitHub)    │         │         │
│         │ button  │          │         │              │         │         │
└────┬────┘         └─────┬────┘         └───────┬──────┘         └────┬────┘
     │                    │                      │                     │
     │                    │  User authorizes     │                     │
     │                    │<─────────────────────┘                     │
     │                    │                                            │
     │                    │  Exchange code for tokens                  │
     │                    │                                            │
     │                    │  Find or create user ─────────────────────>│
     │                    │                                            │
     │                    │  Generate JWT                              │
     │                    │<───────────────────────────────────────────┘
     │  Redirect with    │
     │  ?token=xxx       │
     │<──────────────────┘
     │
     │ Store token, reload app
     v
┌──────────┐
│Logged In │
└──────────┘
```

## Component Interactions

### Backend Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Express Server                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │                    Request Pipeline                         ││
│  │                                                             ││
│  │  1. CORS Middleware ──> 2. Rate Limiter ──> 3. Body Parser││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │                  Route Registration                         ││
│  │                                                             ││
│  │  Public Routes:                                            ││
│  │    /api/auth/login                                         ││
│  │    /api/auth/logout                                        ││
│  │    /api/auth/google                                        ││
│  │    /api/auth/github                                        ││
│  │    /api/auth/oidc/*                                        ││
│  │    /api/config                                             ││
│  └────────────────────────────────────────────────────────────┘│
│                           ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐│
│  │              Auth Middleware (Protected Routes)            ││
│  │                                                             ││
│  │  • Validate JWT token                                      ││
│  │  • Check session in database                               ││
│  │  • Inject user into req.user                               ││
│  │  • Update last_seen timestamp                              ││
│  └────────────────────────────────────────────────────────────┘│
│                           ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐│
│  │                  Protected Routes                           ││
│  │                                                             ││
│  │  /api/admin/*  (Admin only)                                ││
│  │  /api/sessions (All authenticated users)                   ││
│  │  /api/claude   (All authenticated users)                   ││
│  │  /api/folders  (All authenticated users)                   ││
│  │  /api/export   (All authenticated users)                   ││
│  └────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Frontend Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      React Application                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │                      App.tsx (Root)                         ││
│  │                                                             ││
│  │  • Check deployment mode                                   ││
│  │  • Initialize auth store                                   ││
│  │  • Show LoginPage if not authenticated                     ││
│  │  • Render MainLayout if authenticated                      ││
│  └────────────────────────────────────────────────────────────┘│
│                           ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐│
│  │                 useAuthStore (Zustand)                      ││
│  │                                                             ││
│  │  State:                                                     ││
│  │    • user: AuthUser | null                                 ││
│  │    • token: string | null                                  ││
│  │    • isLoading: boolean                                    ││
│  │    • isTeamMode: boolean                                   ││
│  │                                                             ││
│  │  Actions:                                                   ││
│  │    • login(username, password)                             ││
│  │    • logout()                                              ││
│  │    • checkAuth()                                           ││
│  └────────────────────────────────────────────────────────────┘│
│                           ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐│
│  │                      Components                             ││
│  │                                                             ││
│  │  • LoginPage.tsx                                           ││
│  │  • Settings.tsx (Team tab)                                 ││
│  │  • All other pages (use auth store)                        ││
│  └────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

```
┌────────────────────────────────────────────────────────────────┐
│                         SQLite Database                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ users                                                    │  │
│  ├─────────────────────────────────────────────────────────┤  │
│  │ id              TEXT PRIMARY KEY                         │  │
│  │ username        TEXT UNIQUE NOT NULL                     │  │
│  │ password_hash   TEXT NOT NULL      ──> bcrypt(password) │  │
│  │ role            TEXT DEFAULT 'analyst'                   │  │
│  │ display_name    TEXT                                     │  │
│  │ email           TEXT                                     │  │
│  │ monthly_token_budget INTEGER DEFAULT 0                   │  │
│  │ created_at      DATETIME DEFAULT CURRENT_TIMESTAMP       │  │
│  │ last_login      DATETIME                                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           │ user_id (FK)                        │
│                           ↓                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ user_sessions                                            │  │
│  ├─────────────────────────────────────────────────────────┤  │
│  │ token           TEXT PRIMARY KEY  ──> JWT token         │  │
│  │ user_id         TEXT NOT NULL (FK to users)             │  │
│  │ created_at      DATETIME DEFAULT CURRENT_TIMESTAMP       │  │
│  │ expires_at      DATETIME NOT NULL  (created_at + 7 days)│  │
│  │ last_seen       DATETIME DEFAULT CURRENT_TIMESTAMP       │  │
│  └─────────────────────────────────────────────────────────┘  │
│                           │                                     │
│                           │ user_id (FK)                        │
│                           ↓                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ user_monthly_usage                                       │  │
│  ├─────────────────────────────────────────────────────────┤  │
│  │ id              TEXT PRIMARY KEY                         │  │
│  │ user_id         TEXT NOT NULL (FK to users)             │  │
│  │ year_month      TEXT NOT NULL  (e.g., "2026-02")        │  │
│  │ input_tokens    INTEGER DEFAULT 0                        │  │
│  │ output_tokens   INTEGER DEFAULT 0                        │  │
│  │ UNIQUE(user_id, year_month)                             │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ password_reset_tokens                                    │  │
│  ├─────────────────────────────────────────────────────────┤  │
│  │ id              INTEGER PRIMARY KEY AUTOINCREMENT        │  │
│  │ user_id         TEXT NOT NULL                            │  │
│  │ token           TEXT NOT NULL UNIQUE  ──> random hex    │  │
│  │ expires_at      DATETIME NOT NULL  (created_at + 1 hour)│  │
│  │ used            INTEGER DEFAULT 0                        │  │
│  │ created_at      DATETIME DEFAULT CURRENT_TIMESTAMP       │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## Role-Based Access Control

```
┌─────────────────────────────────────────────────────────────────┐
│                        Permission Matrix                         │
├─────────────┬──────────┬─────────┬─────────┬───────────────────┤
│   Feature   │  Viewer  │ Analyst │  Admin  │   Implementation  │
├─────────────┼──────────┼─────────┼─────────┼───────────────────┤
│ View        │    ✅    │   ✅    │   ✅    │ No restriction    │
│ Create      │    ❌    │   ✅    │   ✅    │ requireRole       │
│ Edit        │    ❌    │   ✅    │   ✅    │ requireRole       │
│ Delete      │    ❌    │   ❌    │   ✅    │ requireRole       │
│ Manage Users│    ❌    │   ❌    │   ✅    │ requireRole       │
│ View Team   │    ❌    │   ❌    │   ✅    │ isAdmin check     │
│ Settings    │    ✅    │   ✅    │   ✅    │ Different tabs    │
└─────────────┴──────────┴─────────┴─────────┴───────────────────┘
```

## Security Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                         Security Stack                           │
│                                                                  │
│  Layer 1: Network Security                                      │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ • CORS (localhost only)                                    ││
│  │ • Helmet (security headers)                                ││
│  │ • Rate limiting (300 req/15min general, 60 req/15min auth)││
│  └────────────────────────────────────────────────────────────┘│
│                           ↓                                      │
│  Layer 2: Authentication                                         │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ • JWT token validation                                     ││
│  │ • Session verification in database                         ││
│  │ • Token expiry check (7 days)                              ││
│  └────────────────────────────────────────────────────────────┘│
│                           ↓                                      │
│  Layer 3: Authorization                                          │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ • Role-based access control (RBAC)                         ││
│  │ • Resource ownership verification                          ││
│  │ • Permission matrix enforcement                            ││
│  └────────────────────────────────────────────────────────────┘│
│                           ↓                                      │
│  Layer 4: Data Protection                                        │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ • Bcrypt password hashing (10 rounds)                      ││
│  │ • Secure token generation (crypto.randomBytes)             ││
│  │ • SQL injection prevention (parameterized queries)         ││
│  └────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Token Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                        JWT Token Lifecycle                       │
│                                                                  │
│  1. Login/OAuth Success                                         │
│     ┌────────────────────────────────────────────────────┐     │
│     │ User credentials verified                           │     │
│     │    ↓                                                │     │
│     │ Generate JWT token                                  │     │
│     │    {                                                │     │
│     │      id: "user-uuid",                               │     │
│     │      username: "john",                              │     │
│     │      role: "analyst",                               │     │
│     │      exp: 1709123456  // 7 days from now           │     │
│     │    }                                                │     │
│     │    ↓                                                │     │
│     │ Sign with JWT_SECRET                                │     │
│     │    ↓                                                │     │
│     │ Store in user_sessions table                        │     │
│     │    ↓                                                │     │
│     │ Return to client                                    │     │
│     └────────────────────────────────────────────────────┘     │
│                           ↓                                      │
│  2. Client Storage                                              │
│     ┌────────────────────────────────────────────────────┐     │
│     │ localStorage.setItem('openexpert-token', token)    │     │
│     └────────────────────────────────────────────────────┘     │
│                           ↓                                      │
│  3. API Request                                                 │
│     ┌────────────────────────────────────────────────────┐     │
│     │ headers: {                                          │     │
│     │   Authorization: `Bearer ${token}`                  │     │
│     │ }                                                   │     │
│     └────────────────────────────────────────────────────┘     │
│                           ↓                                      │
│  4. Server Validation (Every Request)                           │
│     ┌────────────────────────────────────────────────────┐     │
│     │ Verify JWT signature                                │     │
│     │    ↓                                                │     │
│     │ Check expiry (exp claim)                            │     │
│     │    ↓                                                │     │
│     │ Verify session in database                          │     │
│     │    ↓                                                │     │
│     │ Update last_seen timestamp                          │     │
│     │    ↓                                                │     │
│     │ Inject user into req.user                           │     │
│     └────────────────────────────────────────────────────┘     │
│                           ↓                                      │
│  5. Logout / Expiry                                             │
│     ┌────────────────────────────────────────────────────┐     │
│     │ DELETE FROM user_sessions WHERE token = ?          │     │
│     │    ↓                                                │     │
│     │ localStorage.removeItem('openexpert-token')        │     │
│     └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## User Management Interface

```
┌─────────────────────────────────────────────────────────────────┐
│          Settings → Team Tab (Admin View)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ 👥 Team Members                         [+ Add User]        ││
│  ├────────────────────────────────────────────────────────────┤│
│  │                                                             ││
│  │  Username   Display Name    Role      Budget   Used   Last ││
│  │  ────────   ─────────────   ─────     ──────   ────   ──── ││
│  │  admin      Administrator   Admin     ∞        45k    Today││
│  │  john       John Doe        Analyst   500k     123k   12/2 ││
│  │  jane       Jane Smith      Viewer    0        0      Never││
│  │                                                             ││
│  │  Actions per user:                                          ││
│  │    🔑 Reset Password (inline form)                          ││
│  │    🗑️ Delete User (with confirmation)                      ││
│  │                                                             ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ 📊 Usage This Month                                         ││
│  ├────────────────────────────────────────────────────────────┤│
│  │                                                             ││
│  │  John Doe                    123,000 / 500,000 tokens      ││
│  │  ████████░░░░░░░░░░ 24.6%                                  ││
│  │                                                             ││
│  │  Jane Smith                  0 / unlimited tokens           ││
│  │  (No usage this month)                                      ││
│  │                                                             ││
│  │  admin                       45,000 / unlimited tokens      ││
│  │  ████████████████████ 100%                                  ││
│  │                                                             ││
│  └────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## OAuth Provider Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                    Supported OAuth Providers                     │
│                                                                  │
│  ┌─────────────────┐      ┌─────────────────┐                  │
│  │     Google      │      │     GitHub      │                  │
│  │  (OAuth 2.0)    │      │  (OAuth 2.0)    │                  │
│  ├─────────────────┤      ├─────────────────┤                  │
│  │ • Email         │      │ • Username      │                  │
│  │ • Name          │      │ • Email         │                  │
│  │ • Profile pic   │      │ • Name          │                  │
│  └─────────────────┘      └─────────────────┘                  │
│                                                                  │
│  ┌──────────────────────────────────────────┐                  │
│  │        Enterprise SSO (OIDC)             │                  │
│  │     Supports ANY OIDC Provider           │                  │
│  ├──────────────────────────────────────────┤                  │
│  │ • Azure AD (Microsoft)                   │                  │
│  │ • Okta                                   │                  │
│  │ • Auth0                                  │                  │
│  │ • Google Workspace                       │                  │
│  │ • Keycloak                               │                  │
│  │ • Any OIDC-compliant provider            │                  │
│  └──────────────────────────────────────────┘                  │
│                                                                  │
│  Common Flow:                                                   │
│  1. User clicks provider button on login page                  │
│  2. Redirected to provider for authentication                  │
│  3. User authorizes application                                │
│  4. Provider redirects back with authorization code            │
│  5. Server exchanges code for tokens                           │
│  6. Server validates ID token                                  │
│  7. Server finds or creates user account (email as key)        │
│  8. Server generates JWT and creates session                   │
│  9. User redirected to app with token                          │
│  10. Client stores token and loads user session                │
└─────────────────────────────────────────────────────────────────┘
```

## Error Handling

```
┌─────────────────────────────────────────────────────────────────┐
│                        Error Responses                           │
│                                                                  │
│  400 Bad Request                                                │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ { "error": "Username and password required" }              ││
│  │ { "error": "Password must be at least 6 characters" }      ││
│  │ { "error": "Token and new password are required" }         ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
│  401 Unauthorized                                               │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ { "error": "Invalid credentials" }                         ││
│  │ { "error": "Session expired — please log in again" }       ││
│  │ { "error": "Authentication required" }                     ││
│  │ { "error": "Invalid token" }                               ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
│  403 Forbidden                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ { "error": "Insufficient permissions" }                    ││
│  │ { "error": "Admin access required" }                       ││
│  │ { "error": "Cannot delete yourself" }                      ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
│  409 Conflict                                                   │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ { "error": "Username already exists" }                     ││
│  │ { "error": "Email already registered" }                    ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                  │
│  429 Too Many Requests                                          │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ { "error": "Too many requests. Please wait..." }           ││
│  └────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Configuration Decision Tree

```
┌─────────────────────────────────────────────────────────────────┐
│              Which Deployment Mode Should I Use?                 │
│                                                                  │
│  START: How many users?                                         │
│     │                                                            │
│     ├─ Just me ──────────> Solo Mode                            │
│     │                      • No login screen                     │
│     │                      • Instant access                      │
│     │                      • All features work                   │
│     │                      • Personal audit trail                │
│     │                                                            │
│     └─ Multiple users ───> Team Mode                            │
│                            │                                     │
│                            ├─ Password only? ──> Basic Setup    │
│                            │                    • Users table   │
│                            │                    • JWT tokens    │
│                            │                    • User mgmt UI  │
│                            │                                     │
│                            ├─ Google/GitHub? ──> OAuth Setup    │
│                            │                    • Provider keys │
│                            │                    • Auto-provision│
│                            │                                     │
│                            └─ Enterprise SSO? ─> OIDC Setup     │
│                                                 • OIDC config   │
│                                                 • Azure AD/Okta │
│                                                 • SAML alt      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Summary

This authentication system provides:

✅ **Flexibility:** Solo mode for personal use, Team mode for organizations
✅ **Security:** Industry-standard practices (bcrypt, JWT, RBAC)
✅ **Scalability:** Handles 1 to 1000+ users
✅ **Integration:** OAuth and SSO for enterprise environments
✅ **Usability:** Clean UI with comprehensive admin controls
✅ **Monitoring:** Real-time usage tracking and budget enforcement

The architecture is production-ready and requires zero modifications for Master Plan item 2.3.
