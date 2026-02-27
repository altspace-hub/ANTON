# Authentication Quick Start Guide

## 🚀 Getting Started in 2 Minutes

### Solo Mode (Personal Use)
1. Run the app: `npm run dev`
2. Visit http://localhost:5173
3. Click **"Enter Anton"** — no login needed!

### Team Mode (Multi-User)
1. Add to `.env`:
   ```bash
   DEPLOYMENT_MODE=team
   JWT_SECRET=your-random-secret-at-least-32-characters-long
   ```

2. Initialize database:
   ```bash
   npm run db:init
   ```

3. Start server:
   ```bash
   npm run dev
   ```

4. **IMPORTANT:** On first launch, check the console for:
   ```
   ADMIN ACCOUNT CREATED (first launch):
     Username: admin
     Password: Xy3mK9pQ  ← SAVE THIS!
   ```

5. Login at http://localhost:5173
   - Username: `admin`
   - Password: [from console]

6. **Change password immediately:**
   - Go to Settings → Team
   - Click edit icon next to admin user
   - Enter new password

## 👤 Default User Roles

| Role | Can View | Can Create | Can Edit | Can Manage Users |
|------|----------|------------|----------|------------------|
| **Viewer** | ✅ | ❌ | ❌ | ❌ |
| **Analyst** | ✅ | ✅ | ✅ | ❌ |
| **Admin** | ✅ | ✅ | ✅ | ✅ |

## ➕ Creating New Users (Admin Only)

1. Go to **Settings → Team** tab
2. Click **"+ Add User"**
3. Fill in:
   - Username (required)
   - Password (required, min 6 chars)
   - Display Name (optional)
   - Role (analyst, viewer, or admin)
   - Monthly Token Budget (0 = unlimited)
4. Click **"Create User"**

## 🔑 Resetting Passwords

### As Admin (Reset Any User)
1. Settings → Team
2. Click edit icon next to user
3. Enter new password
4. Click Save

### As User (Forgot Password)
Requires email configuration in `.env`:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourcompany.com
```

Then:
1. Click "Forgot password?" on login page
2. Enter email address
3. Check inbox for reset link
4. Click link and set new password

## 🌐 OAuth Setup (Optional)

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI:
   ```
   http://localhost:3001/api/auth/google/callback
   ```
4. Add to `.env`:
   ```bash
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   BASE_URL=http://localhost:3001
   ```
5. Restart server
6. "Continue with Google" button appears on login page

### GitHub OAuth
1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Create new OAuth App
3. Set callback URL:
   ```
   http://localhost:3001/api/auth/github/callback
   ```
4. Add to `.env`:
   ```bash
   GITHUB_CLIENT_ID=your-client-id
   GITHUB_CLIENT_SECRET=your-client-secret
   ```
5. Restart server

### Enterprise SSO (Azure AD / Okta)
1. Register application in your identity provider
2. Add redirect URI:
   ```
   http://localhost:3001/api/auth/oidc/callback
   ```
3. Add to `.env`:
   ```bash
   OIDC_ISSUER_URL=https://login.microsoftonline.com/{tenant}/v2.0
   OIDC_CLIENT_ID=your-client-id
   OIDC_CLIENT_SECRET=your-client-secret
   ```
4. Test connection: Settings → General → Test SSO Connection
5. "Enterprise SSO" button appears on login page

## 📊 Managing User Budgets

### Setting Monthly Token Budget
1. Settings → Team
2. Edit user
3. Set Monthly Token Budget (e.g., 1000000 for 1M tokens)
4. 0 = unlimited

### Monitoring Usage
- **Real-time:** Settings → Team → Usage This Month
- **Progress bars:** Green (< 80%), Yellow (80-99%), Red (≥ 100%)
- **Analytics:** Settings → General → Budget section

## 🔒 Security Best Practices

### JWT Secret
```bash
# Generate strong secret (Linux/Mac):
openssl rand -base64 32

# Or use any random 32+ character string
JWT_SECRET=kJ8nQ2mP9xR4vT6wY1zA3bC5dE7fG0hI
```

### Password Requirements
- Minimum 6 characters (enforced)
- Recommend: 12+ characters, mixed case, numbers, symbols
- Change default admin password immediately

### Session Security
- Sessions expire after 7 days
- Logout clears server session (not just client token)
- Inactive sessions auto-expire

## 🆘 Troubleshooting

### "Invalid credentials" error
- ✅ Check username (case-sensitive)
- ✅ Check password
- ✅ Ensure team mode is enabled
- ✅ Verify user exists: `sqlite3 data/workbench.sqlite "SELECT username, role FROM users;"`

### "Session expired"
- Token older than 7 days
- Server restarted with different JWT_SECRET
- **Fix:** Logout and login again

### OAuth redirect fails
- ✅ Verify callback URL matches exactly
- ✅ Check client ID/secret
- ✅ Ensure provider is enabled
- ✅ Check server logs for error details

### Admin password not generated
- Already exists (only created once)
- Not in team mode
- **Fix:** Query database or create manually:
  ```bash
  npm run db:init
  ```

### Can't delete user
- Cannot delete yourself
- Must be admin to delete users
- **Fix:** Login as different admin user

## 📱 API Usage Example

```typescript
// Login
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'mypassword' })
});
const { token, user } = await loginResponse.json();

// Store token
localStorage.setItem('openexpert-token', token);

// Use token in requests
const dataResponse = await fetch('/api/sessions', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

// Logout
await fetch('/api/auth/logout', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
localStorage.removeItem('openexpert-token');
```

## 🎯 Common Tasks

### Add Your First Team Member
```
1. Settings → Team → + Add User
2. Username: john.doe
3. Password: ChangeMe123!
4. Role: Analyst
5. Budget: 500000 (500k tokens/month)
6. Create User
```

### Switch from Solo to Team
```bash
# 1. Add to .env
DEPLOYMENT_MODE=team
JWT_SECRET=generate-a-long-random-string-here

# 2. Restart server
npm run dev

# 3. Note admin password from console
# 4. Login with admin credentials
```

### Grant Admin Rights to User
```
1. Settings → Team
2. Find user in table
3. Edit → Change Role to "admin"
4. Save
```

### View User Activity
```
1. Settings → Team
2. Check "Usage This Month" section
3. See tokens used per user
4. Monitor budget progress bars
```

## ✅ Success Checklist

After setup, verify:
- [ ] Can login as admin
- [ ] Changed default admin password
- [ ] Created at least one non-admin user
- [ ] Tested login as new user
- [ ] Confirmed role permissions work correctly
- [ ] Budget tracking shows usage
- [ ] Logout works (session cleared)
- [ ] OAuth works (if configured)

## 📚 Related Documentation

- Full technical details: `AUTHENTICATION_SYSTEM.md`
- User management API: See `server/routes/admin.ts`
- Auth middleware: See `server/middleware/auth.ts`
- Frontend components: See `src/stores/useAuthStore.ts`

---

**Need Help?** Check the logs:
```bash
# Server logs show authentication events
npm run dev

# Database inspection
sqlite3 data/workbench.sqlite
> SELECT username, role, last_login FROM users;
> SELECT token, created_at, expires_at FROM user_sessions;
```
