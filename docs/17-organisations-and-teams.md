# Organisations and teams

Open **Teams** in the web app. Accounts must verify their email before creating or joining an organisation. A person can belong to several organisations. Creating a team makes that person the owner; other accounts are not added merely because their email suffix matches.

## Invitations and roles

Owners can invite admins or members from any email domain. Admins can invite members. Invitations appear on the invited person's Teams page and in email when SMTP is configured. A person without an account can create one using the invited address, verify it, then accept. Invitations expire, can be revoked, and can be accepted once. Acceptance checks the exact verified account email and the inviter's current authority; the URL alone grants no membership.

| Capability | Owner | Admin | Member |
| --- | --- | --- | --- |
| View member directory | Yes | Yes | Yes |
| Invite/revoke member invitations | Yes | Yes | No |
| Invite admins/change roles | Yes | No | No |
| Deactivate another member | Yes | Members only | No |
| Leave organisation | Transfer ownership first | Yes | Yes |
| Rename, manage domains or domain joining | Yes | No | No |
| Transfer ownership | Yes, with master-password reauthentication | No | No |

Ownership transfer changes organisation roles; it does not transfer personal vault items. Deactivation retains an inactive membership record so verified-domain joining cannot bypass removal. An authorised new invitation can reactivate the membership.

## Optional domain joining

The owner adds a company domain and publishes the generated TXT name/value in its DNS. **Verify DNS** checks that value through the configured HTTPS DNS resolver. The resolver uses the [Google Public DNS JSON API](https://developers.google.com/speed/public-dns/docs/doh/json) by default. Verification expires after the configured interval and can be renewed.

After verification, the owner can enable domain joining. A verified account with an exact matching email domain can then discover the organisation and choose **Join team**. Subdomains and different domains are not implicitly trusted. Only one organisation can hold an active claim to a domain. Expired verification prevents new domain joins; removing a domain disables domain joining. Existing members remain until explicitly deactivated.

## Password sharing and removal

The item's **Share** drawer now offers **Personal share** or a team name. A team-scoped share requires active membership for both people and uses the existing browser RSA key-wrapping flow. Membership and admin roles do not grant access to personal vaults. Recipients with Manage permission can delegate within the same team; they cannot turn delegated team access into personal or other-team grants.

Deactivating or leaving removes team-scoped grants received or issued by that member. Machine tokens recheck the creator's current item access. Personal shares, personal item ownership and other organisations are preserved; review independent grants from **Shared → People**. Items remain individually owned, rather than becoming organisation-owned collections. This is not a replacement for organisation-owned vaults, group policies or corporate asset transfer.

As with existing sharing, revocation cannot erase data already copied or decrypted by a recipient. This change does not rotate item encryption keys or add a new encrypted-content format. Those remain explicit future cryptographic work.

## Storage and configuration

Models live in `app/db/models/organization*_model.py`; requests/responses in `schemas/organizations.py`; business rules in `services/organizations_service.py`; routes in `api/organizations.py`. New tables have RLS enabled, and protected API routes enforce membership. `secret_accesses.organization_id` marks the provenance of team grants. Existing grants remain personal (`NULL`), preserving current behavior.

Names, member emails, roles, invitations and domain records are operational metadata. Password contents, per-item keys and personal vault content remain encrypted. Mutations audit without storing password proofs, invitation URLs or keys in audit details. Membership changes and invitation acceptance lock the organisation to serialize concurrent actions.

The grouped `.env` and `.env.example` include invitation lifetime/cooldown, member limit, DNS resolver/timeout, and domain verification lifetime. No production DNS records are edited by the application; owners publish their challenges themselves.

## Email and verification results

Team invitation and membership-change emails use the Vaultessa sharing PNG and shared light/dark layout. There are now 21 example emails and 42 light/dark previews. `python scripts/verify_local_email.py` submits only fictional messages to loopback SMTP in development, then verifies Mailpit HTML, plain text, dark CSS and inline assets. It refuses external SMTP hosts and non-loopback inbox URLs.

Local SMTP verification passed for all 21 emails. Automated tests cover membership isolation, verified-email invitations, role escalation prevention, expiry/revocation, concurrent acceptance, domain claims and team-scoped grant removal. Browser visual/click-through QA is unavailable because no browser surface is connected. Real DNS ownership and Gmail/Outlook delivery/rendering require the deployed domain/accounts; they are not claimed verified locally.

Firebase SMS remains intentionally deferred. Future roadmap items such as SSO, groups, shared collections, extensions, billing and external security review are separate from this team's onboarding implementation.

Final automated results: 105 backend tests, 51 frontend tests, typecheck/build, Ruff, and Alembic consistency checks passed. The team-grant migration was rolled back and reapplied in the disposable test database, and RLS flags were checked there. New migrations are additive and applied to the local development database.
