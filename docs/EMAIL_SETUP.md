# Email Setup — hello@beatably.app

Custom domain email for **beatably.app**, set up July 2026. **Free** — no Google Workspace,
no paid ImprovMX plan.

## How it works

- **Receiving:** `hello@beatably.app` → **ImprovMX** (free forwarding) → forwards to the personal
  Gmail inbox **`beatably.app@gmail.com`**.
- **Sending:** Gmail "Send mail as" sends *through Gmail's own SMTP* (`smtp.gmail.com`) with the
  From address set to `hello@beatably.app`. ImprovMX's SMTP relay is **not** used (that's paid).

DNS stays at **GoDaddy** (nameservers `ns51/ns52.domaincontrol.com`) — no nameserver migration,
so the live Netlify/Render records were untouched.

## DNS records (GoDaddy)

Mail-relevant records on `beatably.app`:

| Type | Name | Value | Priority |
|---|---|---|---|
| MX | `@` | `mx1.improvmx.com` | 10 |
| MX | `@` | `mx2.improvmx.com` | 20 |
| TXT | `@` | `v=spf1 include:spf.improvmx.com include:_spf.google.com ~all` | — |

> The SPF `include:_spf.google.com` is there because outbound mail is sent through Gmail's servers.
> **Only these two MX records may exist.** GoDaddy "Airo" originally auto-added Google Workspace MX
> (`aspmx.l.google.com` etc.) — those were deleted. If they reappear, delete them again (and disable
> the Airo managed-MX feature); Google MX at priority 1 silently swallows all mail and bounces it
> (`550 5.1.1 ... NoSuchUser ... gsmtp`).

## Gmail "Send mail as" config

Gmail → Settings → Accounts and Import → "Send mail as" → `hello@beatably.app`:

- SMTP Server: `smtp.gmail.com`
- Port: `587`, TLS
- Username: `beatably.app@gmail.com` (the **full** personal Gmail address)
- Password: a Google **App Password** (16 chars, no spaces) — *not* the normal account password.
  Requires 2-Step Verification enabled on the Google account first
  ([myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).

## Adding more addresses later (e.g. support@)

1. In ImprovMX ([app.improvmx.com](https://app.improvmx.com)) add an alias
   `support@beatably.app → beatably.app@gmail.com` (or a catch-all `*@beatably.app`).
2. No DNS change needed.
3. To *send* as it too, repeat the Gmail "Send mail as" step for that address (same SMTP settings).

## Deliverability caveat

Outbound mail is sent via Gmail's servers with a `beatably.app` From address, so it has **no DKIM
signature aligned to beatably.app** (SPF is partially covered via `_spf.google.com`). Fine for
low-volume support/contact mail; a rare strict receiver (e.g. Yahoo) may flag it. For guaranteed
deliverability at volume, the real fix is **Google Workspace** (~$7/mo, real mailbox + proper
DKIM/DMARC) or **ImprovMX SMTP** ($9/mo).

## Gotchas encountered during setup

- **Bounce from `gsmtp` (`550 5.1.1 ... NoSuchUser`)** = mail is still routing to Google, not
  ImprovMX. Cause: leftover Google MX records, *or* Google's outbound MTA still has the old MX
  cached internally (separate from the public resolver — `dig @8.8.8.8` can look clean while Gmail
  still bounces). The cache clears within ~1 hour of the DNS change; just wait and retry.
- To test **receiving** independently of Google's cache, email `hello@beatably.app` from a
  **non-Google** account (iCloud/Outlook/etc.) — that bypasses the Gmail-send cache entirely.
- `Application-specific password required (534-5.7.9)` = you entered the normal Gmail password;
  use an App Password.
