import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock
from urllib.error import URLError

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select, text

from app.core.errors import AppError
from app.db.models.organization_domain_model import OrganizationDomain
from app.db.models.organization_invitation_model import OrganizationInvitation
from app.db.models.organization_member_model import OrganizationMember
from app.db.models.user_model import User
from app.db.session import SessionLocal
from app.services import organizations_service as service

from .helpers import RSA_WRAPPED, create_secret, register, response_data, share


def verified(api, name, email=None):
    user = register(api, name)
    with SessionLocal() as db:
        row = db.get(User, user.id)
        row.email_verified = True
        if email:
            row.email = email
            user.email = email
        db.commit()
    return user


def create(api, user, name="Example company"):
    response = api.post("/api/organizations", json={"name": name}, headers=user.headers)
    assert response.status_code == 201, response.text
    return response_data(response)


def invite(api, owner, org, user, role="MEMBER"):
    response = api.post(
        f"/api/organizations/{org['id']}/invitations",
        json={"email": user.email, "role": role},
        headers=owner.headers,
    )
    assert response.status_code == 201, response.text
    return response_data(response)


def accept(api, user, invitation):
    return api.post(f"/api/organizations/invitations/{invitation['id']}/accept", headers=user.headers)


def test_creation_requires_verified_account_and_never_shares_personal_vault(api):
    assert api.get("/api/organizations").status_code == 401
    unverified = register(api, "unverified", verified=False)
    assert (
        api.post("/api/organizations", json={"name": "Example"}, headers=unverified.headers).status_code
        == 403
    )
    owner, member = verified(api, "owner"), verified(api, "member")
    secret = create_secret(api, owner)
    org = create(api, owner)
    assert org["role"] == "OWNER" and org["memberCount"] == 1
    assert org["allowDomainJoin"] is False
    invitation = invite(api, owner, org, member)
    assert accept(api, member, invitation).status_code == 200
    assert response_data(api.get("/api/secrets", headers=member.headers)) == []
    assert api.get(f"/api/secrets/{secret['id']}/history", headers=member.headers).status_code == 404
    assert api.get(f"/api/organizations/{org['id']}/members", headers=member.headers).status_code == 200


def test_invitation_is_email_bound_verified_single_use_and_tenant_isolated(api):
    owner, member, stranger = (
        verified(api, "owner"),
        register(api, "member", verified=False),
        verified(api, "stranger"),
    )
    org = create(api, owner)
    invitation = invite(api, owner, org, member)
    assert accept(api, stranger, invitation).status_code == 404
    assert accept(api, member, invitation).status_code == 403
    assert api.get(f"/api/organizations/{org['id']}/members", headers=stranger.headers).status_code == 404
    assert api.get(f"/api/organizations/{org['id']}/invitations", headers=stranger.headers).status_code == 404
    with SessionLocal() as db:
        db.get(User, member.id).email_verified = True
        db.commit()
    assert (
        response_data(api.get("/api/organizations/invitations", headers=member.headers))[0]["id"]
        == invitation["id"]
    )
    assert accept(api, member, invitation).status_code == 200
    assert accept(api, member, invitation).status_code == 400
    assert response_data(api.get("/api/organizations/invitations", headers=member.headers)) == []


def test_roles_ownership_and_admin_boundaries(api):
    owner, admin, member = verified(api, "owner"), verified(api, "admin"), verified(api, "member")
    org = create(api, owner)
    assert accept(api, admin, invite(api, owner, org, admin, "ADMIN")).status_code == 200
    assert accept(api, member, invite(api, admin, org, member)).status_code == 200
    base = f"/api/organizations/{org['id']}"
    assert (
        api.patch(base, json={"name": "Hijack", "allowDomainJoin": False}, headers=admin.headers).status_code
        == 403
    )
    assert (
        api.post(
            base + "/invitations", json={"email": "other@example.com", "role": "ADMIN"}, headers=admin.headers
        ).status_code
        == 403
    )
    assert (
        api.patch(base + f"/members/{member.id}", json={"role": "ADMIN"}, headers=admin.headers).status_code
        == 403
    )
    assert api.delete(base + f"/members/{owner.id}", headers=admin.headers).status_code == 400
    assert (
        api.post(
            base + "/transfer", json={"userId": member.id, "authHash": "wrong"}, headers=owner.headers
        ).status_code
        == 401
    )
    assert (
        api.post(
            base + "/transfer", json={"userId": member.id, "authHash": owner.auth_hash}, headers=owner.headers
        ).status_code
        == 204
    )
    assert (
        api.patch(
            base, json={"name": "New name", "allowDomainJoin": False}, headers=owner.headers
        ).status_code
        == 403
    )
    assert (
        api.patch(
            base, json={"name": "New name", "allowDomainJoin": False}, headers=member.headers
        ).status_code
        == 200
    )
    assert api.delete(base + f"/members/{owner.id}", headers=member.headers).status_code == 204


def test_invite_expiry_revocation_and_removed_inviter(api):
    owner, admin, member = verified(api, "owner"), verified(api, "admin"), verified(api, "member")
    org = create(api, owner)
    assert accept(api, admin, invite(api, owner, org, admin, "ADMIN")).status_code == 200
    invitation = invite(api, admin, org, member)
    with SessionLocal() as db:
        db.get(OrganizationInvitation, invitation["id"]).expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    assert accept(api, member, invitation).status_code == 400
    with SessionLocal() as db:
        db.get(OrganizationInvitation, invitation["id"]).expires_at = datetime.now(UTC) + timedelta(days=1)
        db.commit()
    assert (
        api.delete(f"/api/organizations/{org['id']}/members/{admin.id}", headers=owner.headers).status_code
        == 204
    )
    assert accept(api, member, invitation).status_code == 400


def test_domain_join_requires_dns_ownership_opt_in_verified_matching_email_and_not_deactivated(
    api, monkeypatch
):
    owner = verified(api, "owner", "owner@company.example")
    member = verified(api, "member", "member@company.example")
    outsider = verified(api, "outside", "outside@other.example")
    org = create(api, owner)
    base = f"/api/organizations/{org['id']}"
    assert api.post(base + "/join", headers=member.headers).status_code == 404
    assert (
        api.patch(
            base, json={"name": org["name"], "allowDomainJoin": True}, headers=owner.headers
        ).status_code
        == 400
    )
    response = api.post(base + "/domains", json={"domain": "Company.Example"}, headers=owner.headers)
    assert response.status_code == 201, response.text
    domain = response_data(response)
    monkeypatch.setattr(service, "resolve_txt", lambda name: ["unrelated-verification"])
    assert api.post(base + f"/domains/{domain['id']}/verify", headers=owner.headers).status_code == 400
    monkeypatch.setattr(service, "resolve_txt", lambda name: [domain["txtValue"]])
    assert api.post(base + f"/domains/{domain['id']}/verify", headers=owner.headers).status_code == 200
    assert response_data(api.get("/api/organizations/discover", headers=member.headers)) == []
    assert (
        api.patch(
            base, json={"name": org["name"], "allowDomainJoin": True}, headers=owner.headers
        ).status_code
        == 200
    )
    assert len(response_data(api.get("/api/organizations/discover", headers=member.headers))) == 1
    assert api.post(base + "/join", headers=outsider.headers).status_code == 404
    assert api.post(base + "/join", headers=member.headers).status_code == 200
    assert api.delete(base + f"/members/{member.id}", headers=owner.headers).status_code == 204
    assert api.post(base + "/join", headers=member.headers).status_code == 409
    assert response_data(api.get("/api/organizations/discover", headers=member.headers)) == []
    assert api.delete(base + f"/domains/{domain['id']}", headers=owner.headers).status_code == 204
    assert response_data(api.get("/api/organizations", headers=owner.headers))[0]["allowDomainJoin"] is False


def test_domain_claims_cannot_take_over_another_organisation(api, monkeypatch):
    alice, bob = verified(api, "alice"), verified(api, "bob")
    first, second = create(api, alice), create(api, bob)
    domains = []
    for user, org in [(alice, first), (bob, second)]:
        result = api.post(
            f"/api/organizations/{org['id']}/domains",
            json={"domain": "company.example"},
            headers=user.headers,
        )
        domains.append(response_data(result))
    monkeypatch.setattr(service, "resolve_txt", lambda name: [d["txtValue"] for d in domains])
    assert (
        api.post(
            f"/api/organizations/{first['id']}/domains/{domains[0]['id']}/verify", headers=alice.headers
        ).status_code
        == 200
    )
    assert (
        api.post(
            f"/api/organizations/{second['id']}/domains/{domains[1]['id']}/verify", headers=bob.headers
        ).status_code
        == 409
    )
    with SessionLocal() as db:
        db.get(OrganizationDomain, domains[0]["id"]).verified_until = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    assert (
        api.post(
            f"/api/organizations/{second['id']}/domains/{domains[1]['id']}/verify", headers=bob.headers
        ).status_code
        == 200
    )


def test_concurrent_acceptance_consumes_invitation_once(api):
    owner, member = verified(api, "owner"), verified(api, "member")
    org = create(api, owner)
    invitation = invite(api, owner, org, member)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: accept(api, member, invitation).status_code, range(2)))
    assert sorted(results) == [200, 400]
    with SessionLocal() as db:
        rows = list(
            db.scalars(select(OrganizationMember).where(OrganizationMember.organization_id == org["id"]))
        )
        assert len(rows) == 2


def test_team_scoped_sharing_is_membership_bound_and_personal_shares_survive(api):
    owner, member, outsider = verified(api, "owner"), verified(api, "member"), verified(api, "outsider")
    org = create(api, owner)
    assert accept(api, member, invite(api, owner, org, member)).status_code == 200
    team_item, personal_item = create_secret(api, owner), create_secret(api, owner)
    body = {
        "userId": outsider.id,
        "wrappedKey": RSA_WRAPPED,
        "permission": "VIEW",
        "organizationId": org["id"],
    }
    assert (
        api.post(f"/api/secrets/{team_item['id']}/shares", json=body, headers=owner.headers).status_code
        == 404
    )
    body["userId"] = member.id
    response = api.post(f"/api/secrets/{team_item['id']}/shares", json=body, headers=owner.headers)
    assert response.status_code == 201, response.text
    assert share(api, owner, personal_item["id"], member, "VIEW").status_code == 201
    rows = response_data(api.get("/api/secrets", headers=member.headers))
    assert len(rows) == 2
    assert (
        api.delete(f"/api/organizations/{org['id']}/members/{member.id}", headers=owner.headers).status_code
        == 204
    )
    remaining = response_data(api.get("/api/secrets", headers=member.headers))
    assert [item["id"] for item in remaining] == [personal_item["id"]]
    assert len(response_data(api.get("/api/secrets", headers=owner.headers))) == 2


def test_txt_resolver_handles_google_multi_string_txt_format(monkeypatch):
    response = MagicMock()
    response.__enter__.return_value.read.return_value = json.dumps(
        {"Status": 0, "Answer": [{"type": 16, "data": '"vaultessa-verification=first""second"'}]}
    ).encode()
    monkeypatch.setattr(service, "urlopen", lambda *args, **kwargs: response)
    assert service.resolve_txt("_vaultessa-verification.company.example") == [
        "vaultessa-verification=firstsecond"
    ]


def test_txt_resolver_hides_network_error_details(monkeypatch):
    def fail(*args, **kwargs):
        raise URLError("provider-internal-diagnostic")

    monkeypatch.setattr(service, "urlopen", fail)
    with pytest.raises(AppError) as error:
        service.resolve_txt("_vaultessa-verification.company.example")
    assert error.value.status_code == 503
    assert "provider-internal-diagnostic" not in error.value.message


def test_team_delegation_cannot_escape_scope_and_departing_giver_loses_issued_grants(api):
    owner, giver, recipient = verified(api, "owner"), verified(api, "giver"), verified(api, "recipient")
    org = create(api, owner)
    for user in [giver, recipient]:
        assert accept(api, user, invite(api, owner, org, user)).status_code == 200
    item = create_secret(api, owner)
    path = f"/api/secrets/{item['id']}/shares"
    body = {
        "userId": giver.id,
        "wrappedKey": RSA_WRAPPED,
        "permission": "MANAGE",
        "organizationId": org["id"],
    }
    assert api.post(path, json=body, headers=owner.headers).status_code == 201
    body.update(userId=recipient.id, permission="VIEW", organizationId=None)
    assert api.post(path, json=body, headers=giver.headers).status_code == 403
    body["organizationId"] = org["id"]
    assert api.post(path, json=body, headers=giver.headers).status_code == 201
    assert response_data(api.get("/api/secrets", headers=recipient.headers))[0]["organizationId"] == org["id"]
    assert (
        api.delete(f"/api/organizations/{org['id']}/members/{giver.id}", headers=owner.headers).status_code
        == 204
    )
    assert response_data(api.get("/api/secrets", headers=giver.headers)) == []
    assert response_data(api.get("/api/secrets", headers=recipient.headers)) == []


def test_team_grant_migration_roundtrip_and_rls(database):
    backend = Path(__file__).resolve().parents[1]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "migrations"))
    config.attributes["configure_logger"] = False
    command.downgrade(config, "76df65e636af")
    command.upgrade(config, "head")
    command.check(config)
    with SessionLocal() as db:
        rows = db.execute(
            text("SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY(:tables)"),
            {
                "tables": [
                    "organizations",
                    "organization_members",
                    "organization_domains",
                    "organization_invitations",
                ]
            },
        ).all()
        assert len(rows) == 4
        assert all(enabled for _, enabled in rows)
