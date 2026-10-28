"""Read-only SQLite integrity audit. Does not print employee or account details."""
import json
import sqlite3
from pathlib import Path

database = Path(__file__).resolve().parents[1] / 'db.sqlite3'
connection = sqlite3.connect(f'{database.as_uri()}?mode=ro', uri=True)
queries = {
    'duplicate_active_assignment_groups': "SELECT count(*) FROM (SELECT asset_id FROM inventory_assetassignment WHERE status='ASSIGNED' GROUP BY asset_id HAVING count(*) > 1)",
    'assigned_assets_without_matching_history': "SELECT count(*) FROM inventory_asset a WHERE a.custodian_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inventory_assetassignment h WHERE h.asset_id=a.id AND h.employee_id=a.custodian_id AND h.status='ASSIGNED')",
    'active_assignments_with_wrong_custodian': "SELECT count(*) FROM inventory_assetassignment h JOIN inventory_asset a ON a.id=h.asset_id WHERE h.status='ASSIGNED' AND (a.custodian_id IS NULL OR a.custodian_id!=h.employee_id)",
    'uncategorized_assets': 'SELECT count(*) FROM inventory_asset WHERE super_category_id IS NULL',
    'nonpositive_stock_transactions': 'SELECT count(*) FROM stock_management_stocktransaction WHERE qty <= 0',
    'negative_stock_balances': 'SELECT count(*) FROM stock_management_stockproduct WHERE qty < 0',
}
print(json.dumps({name: connection.execute(sql).fetchone()[0] for name, sql in queries.items()}, indent=2))
connection.close()
