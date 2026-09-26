# Single sign-on with Microsoft Entra ID

This guide is for the IT administrator who connects an ANTON server to Microsoft Entra ID (formerly Azure AD). When it is done, colleagues open ANTON, click **Sign in with Microsoft**, and each person gets their own ANTON account.

ANTON works with any OpenID Connect provider (Okta, Auth0, Keycloak and others), but this guide covers Entra ID.

## What you get

- **One account per person.** ANTON creates each account at first sign-in. It recognises the person afterwards by their Entra object id (`oid`) and tenant id (`tid`), not by email address. A renamed person keeps their account. A reassigned mailbox does not inherit anyone's data.
- **Roles from the directory.** Entra app roles can map onto ANTON's roles (`admin`, `analyst`, `viewer`). ANTON reapplies them at every sign-in, so the directory stays the source of truth. That includes demotion: a person who no longer holds a mapped role gets `OIDC_DEFAULT_ROLE` at their next sign-in.
- **Only your organisation.** With a tenant-specific issuer, only accounts from your tenant can sign in. *Assignment required* narrows that to the people or groups you assign.
- **Offboarding follows Entra.** Removing a person's assignment stops their next sign-in. For an immediate stop, an ANTON admin can also switch the account off in **Settings → Team**.
- **Standard protections.**
  - The sign-in uses the authorization-code flow with PKCE, a state value bound to the browser, and a nonce.
  - The session token never appears in a URL.
  - Accounts that sign in with SSO cannot get a local password by email.

## Before you start

- **The server runs in team mode.** Set `DEPLOYMENT_MODE=team` and give `JWT_SECRET` a random value of at least 32 characters. Team mode refuses to start with the placeholder. `docs/deployment.md` covers the rest of team mode.
- **ANTON is behind HTTPS.**
  - Entra accepts plain-http redirect URIs only for `localhost`.
  - Put a reverse proxy in front: `docs/deployment.md` has an nginx example that sets `X-Forwarded-Proto`.
  - A proxy on the same machine is trusted by default. Otherwise set `TRUST_PROXY` to the proxy's address.
- **`MCP_SECRET` is set.** Behind a proxy on the same machine every request reaches ANTON from 127.0.0.1, so the `/mcp` endpoint cannot tell local tools from the internet. With `MCP_SECRET` set it always asks for the secret.
- **Claude runs on an organisation API key.** Use `ANTHROPIC_API_KEY`. The subscription engine (`sdk:` models) signs in with one person's Claude account, and Anthropic's terms do not allow that account to serve colleagues.

## 1. Register the application in Entra

In the Microsoft Entra admin center, go to **Entra ID → App registrations → New registration**.

1. **Name:** `ANTON`.
2. **Supported account types:** *Accounts in this organizational directory only (single tenant)*.
3. **Redirect URI:** choose platform **Web** and enter `https://anton.example.com/api/auth/oidc/callback`, using your own host.
   - The URI must be `https`.
   - It must match exactly, including letter case and the path.
4. Click **Register**. Note the **Application (client) ID** and the **Directory (tenant) ID** from the overview page.

Then, in the new registration:

5. **Authentication:** leave both implicit-grant boxes unticked. Leave **Allow public client flows** set to *No*.
6. **Certificates & secrets → New client secret.** Copy the **Value**; Entra shows it only once. Note the expiry date, because sign-in stops working when the secret expires.
7. **API permissions:** make sure Microsoft Graph **delegated** permissions `openid`, `profile`, `email` and `User.Read` are present. Then click **Grant admin consent**. Admin consent is required when assignment is enabled in step 3.
8. **Token configuration → Add optional claim → ID → `email`.** This is optional. Without it ANTON uses `preferred_username`, which is usually the sign-in address.

## 2. Create app roles (recommended)

Go to **App roles → Create app role** and create one role for each ANTON role you want to hand out:

| Display name | Value | Allowed member types |
|---|---|---|
| ANTON administrator | `Anton.Admin` | Users/Groups |
| ANTON analyst | `Anton.Analyst` | Users/Groups |
| ANTON viewer | `Anton.Viewer` | Users/Groups |

If a person holds several mapped roles, ANTON uses the highest.

**Using security groups instead of app roles.** Set `OIDC_ROLE_CLAIM=groups` and map group **object ids** in `OIDC_ROLE_MAP`. Entra only sends the claim if you add it: **Token configuration → Add groups claim**, and choose **Groups assigned to the application**, which keeps the list short. A person in more than about 200 groups gets a pointer instead of the list (the *groups overage*). ANTON cannot read their role from it and refuses the sign-in with `groups_overage`, rather than guessing. Assigning groups to an application needs Entra ID P1 or higher. App roles avoid all of this and are the recommended route.

## 3. Assign people

Go to **Enterprise applications → ANTON**:

1. **Properties → Assignment required? → Yes.** Without this, every account in the tenant can sign in.
2. **Users and groups → Add user/group.** Assign people or groups, and choose an app role for each.

Global Administrators can sign in even without an assignment. That is how Entra treats this setting.

## 4. Configure ANTON

Add these values to the server's `.env`:

```bash
DEPLOYMENT_MODE=team
JWT_SECRET=<64 random bytes as hex>
JWT_EXPIRY=8h
NODE_ENV=production
HTTPS=true
APP_PUBLIC_URL=https://anton.example.com
CORS_ORIGINS=https://anton.example.com

OIDC_ISSUER_URL=https://login.microsoftonline.com/<Directory (tenant) ID>/v2.0
OIDC_CLIENT_ID=<Application (client) ID>
OIDC_CLIENT_SECRET=<client secret Value>
OIDC_REDIRECT_URI=https://anton.example.com/api/auth/oidc/callback
OIDC_ROLE_MAP=Anton.Admin=admin,Anton.Analyst=analyst,Anton.Viewer=viewer
# Optional:
# OIDC_REQUIRE_ROLE=true       refuse anyone without a mapped role
# OIDC_DEFAULT_ROLE=analyst    role for a new account when no mapped role applies
# OIDC_ALLOWED_TENANT_IDS=     only needed with a multi-tenant issuer
# OIDC_ROLE_CLAIM=groups       map security-group object ids instead of app roles
# TRUST_PROXY=loopback         the reverse proxy ANTON trusts for X-Forwarded-*

ANTHROPIC_API_KEY=<organisation key>
MCP_SECRET=<random value>
# Leave GOOGLE_* and GITHUB_* unset on a work server.
```

Notes on these values:

- **Issuer URL:**
  - Keep `/v2.0` at the end. Without it Entra serves the v1 endpoints, whose tokens omit the email address of member accounts.
  - Never use the `common`, `organizations` or `consumers` endpoints. ANTON refuses them unless `OIDC_ALLOWED_TENANT_IDS` is set, because they accept accounts from any Microsoft directory.
- **Redirect URI:** `OIDC_REDIRECT_URI` must be identical to the URI registered in step 1.
- **Public URL:** `APP_PUBLIC_URL` is where the browser lands after sign-in. Password-reset links for local accounts use it as well. People should open ANTON at this address; a sign-in started on another name for the server (a short intranet name or the IP) is sent to this host first.
- **Session length:** `JWT_EXPIRY=8h` signs people out after 8 hours. Without it a session lasts 7 days.
- **Google and GitHub:** leave them off. Those sign-ins accept any account on the internet and match by email address.

Restart ANTON.

## 5. Test

1. **Check the configuration.** Sign in with the break-glass admin (see below), open **Settings → General**, scroll to **Single Sign-On (Enterprise SSO)**, and click **Test SSO Connection**. For an administrator it shows:
   - the discovered issuer;
   - the redirect URI ANTON sends;
   - how tenants and roles are restricted;
   - any errors or warnings.

   It never contains a secret. Without signing in, `curl https://anton.example.com/api/auth/oidc/test` answers only whether discovery works.
2. **Sign in.** Open ANTON in a private window and click **Sign in with Microsoft**. The first sign-in creates the account, and it appears in **Settings → Team** with an **SSO** badge.
3. **Check who is refused.** Try an account that is not assigned. Entra refuses it, and ANTON shows *"You may not be assigned to ANTON yet"*.

## The first administrator

Either of these works:

- **With role mapping (recommended):** assign yourself `Anton.Admin`. Your first SSO sign-in is then an administrator.
- **Break-glass account:** the first team-mode start creates a local `admin` account and writes its password to `data/initial-credentials.txt`. Sign in once, change the password, and delete that file.
  - Keep this account for emergencies, such as an expired client secret.
  - Leave the break-glass account **without an email address**. An account an administrator created before SSO (it has a password) is linked once to the SSO identity with the same verified address, and from then on it signs in through the directory only: its password is removed. That is right for colleagues you created by hand, and wrong for the emergency account.

## Day-to-day administration

| Task | Where |
|---|---|
| Add a person | Assign them in Entra (step 3). ANTON creates their account at first sign-in. |
| Change a role | Change the app-role assignment in Entra. It takes effect at their next sign-in. Without role mapping, change the role in **Settings → Team**. |
| Remove a person | Remove the assignment in Entra, so their next sign-in is refused. For an immediate stop, use **Settings → Team → Switch off**: it ends their sessions and keeps their data. A session is not checked against Entra until it ends. |
| Session length | `JWT_EXPIRY` (for example `8h`). A session is not checked against Entra until it ends. |
| Rotate the client secret | Create a new secret in Entra, update `OIDC_CLIENT_SECRET`, restart, then delete the old secret. |

## Troubleshooting

The login page shows a readable message. The server log records the reason code, and the Entra error code (`AADSTS…`) when Entra sent one, as a line starting `[auth] SSO sign-in refused`. The same lines are kept as security events: `GET /api/audit/security` (administrator) lists them.

| What you see | Cause |
|---|---|
| Entra error `AADSTS50011` | The redirect URI does not match. Compare `OIDC_REDIRECT_URI` character for character with the registered URI. |
| Entra error `AADSTS50105`, or ANTON shows "not assigned" (`sso_denied`) | The person is not assigned to the enterprise application. |
| Entra error `AADSTS700016` | Wrong `OIDC_CLIENT_ID`, or an issuer with the wrong tenant. |
| Entra error `AADSTS7000215` / `AADSTS7000222` | Wrong or expired client secret. |
| `tenant_not_allowed` | The account's tenant is not in `OIDC_ALLOWED_TENANT_IDS`. |
| `no_role` | `OIDC_REQUIRE_ROLE=true` and the person holds no mapped role. |
| `account_disabled` | An ANTON admin switched the account off. |
| `ambiguous_email` | Several local accounts share the person's email address, so ANTON will not guess which to link. Change the address on the others in **Settings → Team → Email**. |
| `groups_overage` | `OIDC_ROLE_CLAIM=groups` and the person is in more than about 200 groups. Assign ANTON app roles instead, or use "Groups assigned to the application" (see step 2). |
| `invalid_state` | The sign-in took more than 10 minutes, was started in another browser, or the server restarted during it. Sign in again. |
| `sso_misconfigured` | Run the test in step 5; it names the setting. |
| The button does not appear | The server is not in team mode, or `OIDC_ISSUER_URL` / `OIDC_CLIENT_ID` is missing. |

## What ANTON stores

- **Identities.** Each SSO identity is one row in `user_identities`, holding the provider, issuer, subject (Entra `oid`), tenant id, and the email seen at the last sign-in. It belongs to exactly one row in `users`. For Entra the issuer is stored in its v2.0 form built from the tenant id, so moving `OIDC_ISSUER_URL` between the v1 and v2.0 endpoints keeps every account.
- **No tokens.** The ID and access tokens from Entra are not stored. ANTON issues its own session, which lasts `JWT_EXPIRY`.
- **Switched-off accounts** keep their data. `users.disabled_at` records when the account was switched off.
