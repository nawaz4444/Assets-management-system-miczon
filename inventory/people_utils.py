"""Shared helpers for cleaning up Employee records (email sync + dedupe).

Kept env-agnostic and name-based so the same logic runs on any database
(dev or production) without relying on specific primary keys.
"""
from django.db import transaction


def normalize_name(name):
    """Lowercase, collapse whitespace — the key used to detect same-name dupes."""
    return ' '.join((name or '').strip().lower().split())


def is_placeholder_email(email):
    e = (email or '').strip().lower()
    return (not e) or e.startswith('unknown-')


def merge_employee_into(keep, merge):
    """Move every record from `merge` onto `keep`, then delete `merge`.

    Reassigns all foreign keys first (so nothing is cascade-deleted), handling
    the (session, employee, asset) uniqueness on health responses. Returns a
    dict of how many of each record type were moved.
    """
    from .models import (
        Asset, AssetAssignment, AssetHistory, AssetActionRequest,
        HealthCheckResponse, Department, Ticket,
    )

    moved = {}
    with transaction.atomic():
        moved['assets'] = Asset.objects.filter(custodian=merge).update(custodian=keep)
        moved['assignments'] = AssetAssignment.objects.filter(employee=merge).update(employee=keep)
        moved['history_from'] = AssetHistory.objects.filter(from_employee=merge).update(from_employee=keep)
        moved['history_to'] = AssetHistory.objects.filter(to_employee=merge).update(to_employee=keep)
        moved['requests'] = AssetActionRequest.objects.filter(requester=merge).update(requester=keep)
        moved['request_targets'] = AssetActionRequest.objects.filter(target_employee=merge).update(target_employee=keep)
        moved['tickets'] = Ticket.objects.filter(raised_by=merge).update(raised_by=keep)
        moved['ticket_for'] = Ticket.objects.filter(raised_for=merge).update(raised_for=keep)
        moved['ticket_agent'] = Ticket.objects.filter(assigned_agent=merge).update(assigned_agent=keep)
        moved['departments_managed'] = Department.objects.filter(manager=merge).update(manager=keep)

        # Health responses: respect the (session, employee, asset) unique constraint.
        hc = 0
        for resp in HealthCheckResponse.objects.filter(employee=merge):
            clash = HealthCheckResponse.objects.filter(
                session=resp.session, employee=keep, asset=resp.asset
            ).exists()
            if clash:
                resp.delete()
            else:
                resp.employee = keep
                resp.save(update_fields=['employee'])
                hc += 1
        moved['health_responses'] = hc

        # Agent-group memberships.
        groups = 0
        for g in merge.agent_groups.all():
            g.members.add(keep)
            g.members.remove(merge)
            groups += 1
        moved['agent_groups'] = groups

        # If keep is missing an email/department, inherit from merge.
        updates = []
        if is_placeholder_email(keep.email) and not is_placeholder_email(merge.email):
            keep.email = merge.email
            updates.append('email')
        if keep.department_id is None and merge.department_id is not None:
            keep.department_id = merge.department_id
            updates.append('department')
        if updates:
            keep.save(update_fields=updates)

        merge.delete()

    return moved


def pick_keeper(employees):
    """Choose the canonical record from a duplicate group: prefer a real email,
    then a linked user, then the most assets, then the lowest id."""
    from .models import Asset

    def score(e):
        return (
            0 if is_placeholder_email(e.email) else 1,
            1 if e.user_id else 0,
            Asset.objects.filter(custodian=e).count(),
            -e.id,
        )
    return max(employees, key=score)
