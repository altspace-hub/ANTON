# Authentication System Documentation

## Overview

The FCP Workbench has a **fully functional authentication system** already implemented. This document describes the complete system architecture, features, and usage.

## Deployment Modes

The application supports two deployment modes controlled by the `DEPLOYMENT_MODE` environment variable:

### Solo Mode (Default)
- **Environment:** `DEPLOYMENT_MODE=solo` or not set
- **Behavior:** No login required; bypass available
- **User:** Single "solo" user with admin privileges
- **Use case:** Personal/development use

### Team Mode
- **Environment:** `DEPLOYMENT_MODE=team`
- **Behavior:** Login required for all users
- **Features:** Multi-user, role-based access, user management
- **Use case:** Team/enterprise deployment

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'analyst',  -- 'admin', 'analyst', 'viewer'
  display_name TEXT,
  email TEXT,
  monthly_token_budget INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
)
```

### User Sessions Table
```sql
CREATE TABLE user_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### User Monthly Usage Table
```sql
CREATE TABLE user_monthly_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  UNIQUE(user_id, year_month)
)
```

### Password Reset Tokens Table
```sql
CREATE TABLE password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## Backend Components

### 1. Auth Service (`server/middleware/auth.ts`)

**Functions:**
- `createAuthMiddleware(db)` - Express middleware for route protection
- `requireRole(role)` - Role-based access control middleware
- `generateToken(user)` - JWT token generation (7-day expiry)

**Token Verification:**
- Validates JWT signature
- Checks session existence in database
- Updates last_seen timestamp
- Returns 401 for invalid/expired tokens

**Roles Hierarchy:**
```typescript
viewer: 0   // Read-only access
analyst: 1  // Standard user, can create/edit
admin: 2    // Full access, can manage users
```

### 2. Auth Routes (`server/routes/auth.ts`)

#### Standard Authentication

**POST /api/auth/login**
- Input: `{ username, password }`
- Output: `{ user, token }`
- Creates session in database
- Updates last_login timestamp

**POST /api/auth/logout**
- Deletes session from database
- Returns `{ success: true }`

**GET /api/auth/me**
- Returns current user info
- Requires valid Bearer token

#### Password Reset

**POST /api/auth/forgot-password**
- Input: `{ email }`
- Generates reset token (1-hour expiry)
- Sends email with reset link
- Always returns 200 (security - no user enumeration)

**POST /api/auth/reset-password**
- Input: `{ token, newPassword }`
- Validates token (not used, not expired)
- Updates password
- Marks token as used

#### OAuth Providers (Optional)

**Google OAuth**
- GET /api/auth/google - Redirect to Google consent
- GET /api/auth/google/callback - Handle OAuth callback
- Requires: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

**GitHub OAuth**
- GET /api/auth/github - Redirect to GitHub
- GET /api/auth/github/callback - Handle OAuth callback
- Requires: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`

**Enterprise SSO (OIDC)**
- GET /api/auth/oidc/test - Test OIDC configuration
- GET /api/auth/oidc/start - Initiate OIDC flow
- GET /api/auth/oidc/callback - Handle OIDC callback
- Supports: Azure AD, Okta, Auth0, any OIDC provider
- Requires: `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`

### 3. Admin Routes (`server/routes/admin.ts`)

**All routes require admin role**

**GET /api/admin/users**
- Lists all users with token usage this month
- Includes: id, username, role, display_name, monthly_token_budget, tokens_this_month

**POST /api/admin/users**
- Creates new user
- Input: `{ username, password, role, display_name, monthly_token_budget }`
- Returns: `{ success: true, id }`

**PATCH /api/admin/users/:id**
- Updates user fields
- Can update: role, display_name, monthly_token_budget, password
- Cannot update own role/delete self

**DELETE /api/admin/users/:id**
- Deletes user (except self)
- Cascades to sessions and usage records

**GET /api/admin/usage**
- Returns token usage breakdown per user for current month
- Includes: username, display_name, role, monthly_token_budget, input_tokens, output_tokens

## Frontend Components

### 1. Auth Store (`src/stores/useAuthStore.ts`)

**State:**
```typescript
{
  user: AuthUser | null,
  token: string | null,
  isLoading: boolean,
  isTeamMode: boolean
}
```

**Actions:**
- `login(username, password)` - Authenticate user
- `logout()` - Clear session
- `checkAuth()` - Validate existing token
- `setIsTeamMode(value)` - Set deployment mode

**Token Storage:**
- Stored in localStorage as 'openexpert-token'
- Automatically included in API requests via Authorization header
- Cleared on logout or token expiry

### 2. Login Page (`src/pages/LoginPage.tsx`)

**Features:**
- Modern, clean design with robot imagery
- Username/password form
- Show/hide password toggle
- Inline forgot password form
- OAuth buttons (shown when configured)
- Solo mode bypass button
- Handles OAuth redirect with ?token= query parameter

**Solo Mode:**
- Shows "Enter Anton" button
- No authentication required
- Immediate access to application

**Team Mode:**
- Full login form
- Optional OAuth providers
- Password reset flow

### 3. Settings Page - Team Tab (`src/pages/Settings.tsx`)

**Admin-only features (team mode):**

**User Management Section:**
- View all users in table format
- Add new users with role selection
- Edit user roles and budgets
- Reset passwords inline
- Delete users (except self)
- Shows last login and usage

**Usage Monitoring:**
- Current month token usage per user
- Progress bars for budget tracking
- Color-coded warnings (80%, 100%)
- Unlimited budget support (0 = no limit)

**Budget Controls:**
- Set monthly token budget per user
- Visual usage tracking
- Automatic alerts when approaching limit

## First-Time Setup

### Team Mode Initial Admin

When `DEPLOYMENT_MODE=team` is set and no admin user exists, the system automatically creates one on first launch:

```
Username: admin
Password: [randomly generated 8-character password]
```

The password is displayed in the console **once** and must be saved immediately:

```
===========================================
ADMIN ACCOUNT CREATED (first launch):
  Username: admin
  Password: Xy3mK9pQ
Save this password — it will not be shown again.
===========================================
```

**IMPORTANT:** Change this password immediately after first login via Settings → Team → Reset Password.

## Security Features

### Password Security
- Passwords hashed with bcrypt (10 rounds)
- Never stored in plain text
- Minimum 6 characters enforced
- Reset tokens expire after 1 hour
- Tokens marked as used after password reset

### Session Security
- JWT tokens with 7-day expiry
- Sessions stored in database (enables server-side logout)
- Last activity tracking
- Automatic session cleanup on token expiry

### API Security
- All protected routes require Bearer token
- Role-based access control (RBAC)
- Rate limiting on auth endpoints
- CORS restricted to localhost by default
- Helmet security headers

### OAuth Security
- State parameter validation (CSRF protection)
- Nonce validation for OIDC
- Automatic user provisioning
- Email-based account linking

## Environment Variables

### Required (Team Mode)
```bash
DEPLOYMENT_MODE=team
JWT_SECRET=your-secret-key-min-32-chars
```

### Optional - Password Reset
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourcompany.com
```

### Optional - Google OAuth
```bash
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
BASE_URL=http://localhost:3001
```

### Optional - GitHub OAuth
```bash
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
```

### Optional - Enterprise SSO (OIDC)
```bash
OIDC_ISSUER_URL=https://login.microsoftonline.com/{tenant}/v2.0
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=http://localhost:3001/api/auth/oidc/callback
```

## API Request Authentication

### Adding Auth to API Calls

All protected API endpoints require the Authorization header:

```typescript
const token = localStorage.getItem('openexpert-token');
const response = await fetch('/api/protected-endpoint', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### Using the Auth Store

```typescript
import { useAuthStore } from '@/stores/useAuthStore';

function MyComponent() {
  const { user, token, login, logout } = useAuthStore();

  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  // Get token for API calls
  const fetchData = async () => {
    const res = await fetch('/api/data', {
      headers: { Authorization: `Bearer ${token}` }
    });
  };
}
```

## User Roles & Permissions

### Admin
- Full access to all features
- User management (create, edit, delete users)
- Budget management
- Connection management
- View all audit logs
- Access Settings → Team tab

### Analyst (Default)
- Create and edit sessions
- Run Claude analyses
- Export outputs
- Access all modules
- View own audit log

### Viewer
- Read-only access
- View existing sessions
- Cannot create/edit sessions
- Cannot run analyses
- View public exports

## Integration Points

### Audit Log Attribution
When team mode is enabled, all audit log entries include user attribution:
- Created by: user_id from JWT
- Reviewed by: user_id from session
- User-specific cost tracking

### Session Isolation
In team mode, sessions can be filtered by user:
- Personal sessions visible to creator
- Shared sessions visible to all
- Admin can view all sessions

### Cost Tracking
Token usage attributed to individual users:
- Monthly usage per user
- Budget enforcement
- Usage reports in Settings → Team

## Testing

### Test Login (Team Mode)
1. Set `DEPLOYMENT_MODE=team` in .env
2. Restart server
3. Note admin password from console
4. Visit http://localhost:3001
5. Login with admin/[generated-password]
6. Go to Settings → Team
7. Verify user management panel

### Test OAuth (Optional)
1. Configure OAuth provider credentials
2. Restart server
3. Verify OAuth buttons appear on login page
4. Click provider button
5. Complete OAuth flow
6. Verify auto-provisioned user account

### Test Password Reset (Optional)
1. Configure SMTP settings
2. Add email to test user account
3. Click "Forgot password?" on login page
4. Enter email
5. Check inbox for reset link
6. Complete password reset

## Common Issues

### "Session expired — please log in again"
- JWT token expired (>7 days old)
- Session deleted from database
- Server restarted with different JWT_SECRET
- **Solution:** Logout and login again

### "Authentication required"
- No token in localStorage
- Token not included in request
- **Solution:** Ensure Authorization header is set

### OAuth redirect fails
- Callback URL mismatch
- Provider credentials incorrect
- **Solution:** Verify OAuth configuration in provider console

### Admin password not shown on first launch
- Admin user already exists
- Not in team mode
- **Solution:** Reset admin password via database or create new admin

## Future Enhancements

Potential improvements for the authentication system:

1. **Two-Factor Authentication (2FA)**
   - TOTP support via QR code
   - Backup codes
   - SMS verification

2. **Session Management**
   - View active sessions
   - Remote session revocation
   - Device tracking

3. **Advanced RBAC**
   - Custom roles
   - Granular permissions
   - Module-level access control

4. **Audit Trail**
   - Login/logout events
   - Failed login attempts
   - Password change history
   - IP address logging

5. **Account Security**
   - Password strength requirements
   - Password expiry policies
   - Account lockout after failed attempts
   - Security questions

## Summary

✅ **Fully Implemented Features:**
- User authentication (username/password)
- JWT-based sessions
- Role-based access control (admin, analyst, viewer)
- User management UI (admin only)
- Password reset flow
- OAuth providers (Google, GitHub, OIDC)
- Team mode vs. Solo mode
- Token usage tracking per user
- Budget management
- First-time setup with auto-generated admin password

✅ **Production Ready:**
- Bcrypt password hashing
- Database-backed sessions
- Secure token storage
- CSRF protection (OAuth state)
- Rate limiting
- Security headers (Helmet)

✅ **No Additional Work Needed:**
The authentication system is complete and functional. All requirements from the Master Plan (item 2.3) have been met and exceeded with OAuth and enterprise SSO support.

---

**Last Updated:** 2026-02-19
**Version:** 1.0
**Status:** ✅ Complete
