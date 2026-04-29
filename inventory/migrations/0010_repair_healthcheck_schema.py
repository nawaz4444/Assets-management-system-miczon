# Repairs databases that applied an earlier 0009 health-check migration shape.

from django.db import migrations


def _columns(schema_editor, table_name):
    with schema_editor.connection.cursor() as cursor:
        return {
            column.name: column
            for column in schema_editor.connection.introspection.get_table_description(cursor, table_name)
        }


def repair_healthcheck_schema(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    session_columns = _columns(schema_editor, 'inventory_healthchecksession')
    response_columns = _columns(schema_editor, 'inventory_healthcheckresponse')
    request_columns = _columns(schema_editor, 'inventory_assetactionrequest')

    quote = schema_editor.quote_name

    if 'requested_device_type' not in request_columns:
        schema_editor.execute(
            f"ALTER TABLE {quote('inventory_assetactionrequest')} "
            f"ADD COLUMN {quote('requested_device_type')} varchar(100) NOT NULL DEFAULT ''"
        )

    if 'status' not in session_columns:
        schema_editor.execute(
            f"ALTER TABLE {quote('inventory_healthchecksession')} "
            f"ADD COLUMN {quote('status')} varchar(20) NOT NULL DEFAULT 'OPEN'"
        )
        if 'is_active' in session_columns:
            schema_editor.execute(
                f"UPDATE {quote('inventory_healthchecksession')} "
                f"SET {quote('status')} = CASE WHEN {quote('is_active')} THEN 'OPEN' ELSE 'CLOSED' END"
            )

    if 'triggered_by_id' not in session_columns:
        schema_editor.execute(
            f"ALTER TABLE {quote('inventory_healthchecksession')} "
            f"ADD COLUMN {quote('triggered_by_id')} integer NULL"
        )

    if 'closed_at' not in session_columns:
        schema_editor.execute(
            f"ALTER TABLE {quote('inventory_healthchecksession')} "
            f"ADD COLUMN {quote('closed_at')} timestamp with time zone NULL"
            if vendor == 'postgresql'
            else f"ALTER TABLE {quote('inventory_healthchecksession')} ADD COLUMN {quote('closed_at')} datetime NULL"
        )

    if 'submitted_at' not in response_columns:
        column_type = 'timestamp with time zone' if vendor == 'postgresql' else 'datetime'
        schema_editor.execute(
            f"ALTER TABLE {quote('inventory_healthcheckresponse')} "
            f"ADD COLUMN {quote('submitted_at')} {column_type} NULL"
        )
        if 'created_at' in response_columns:
            schema_editor.execute(
                f"UPDATE {quote('inventory_healthcheckresponse')} "
                f"SET {quote('submitted_at')} = {quote('created_at')} "
                f"WHERE {quote('submitted_at')} IS NULL"
            )

    if vendor == 'postgresql' and 'battery_life' in response_columns:
        schema_editor.execute(
            f"ALTER TABLE {quote('inventory_healthcheckresponse')} "
            f"ALTER COLUMN {quote('battery_life')} TYPE varchar(30) "
            f"USING CASE "
            f"WHEN {quote('battery_life')}::text = '5' THEN 'EXCELLENT' "
            f"WHEN {quote('battery_life')}::text = '4' THEN 'GOOD' "
            f"WHEN {quote('battery_life')}::text = '3' THEN 'FAIR' "
            f"WHEN {quote('battery_life')}::text = '2' THEN 'POOR' "
            f"WHEN {quote('battery_life')}::text = '1' THEN 'POOR' "
            f"ELSE COALESCE(NULLIF({quote('battery_life')}::text, ''), 'GOOD') END"
        )

    if vendor == 'postgresql' and 'screen_condition' in response_columns:
        schema_editor.execute(
            f"ALTER TABLE {quote('inventory_healthcheckresponse')} "
            f"ALTER COLUMN {quote('screen_condition')} TYPE varchar(30)"
        )

    if vendor == 'postgresql':
        schema_editor.execute(
            "DO $$ BEGIN "
            "IF NOT EXISTS ("
            "SELECT 1 FROM pg_constraint WHERE conname = 'inventory_healthcheckresponse_session_employee_asset_uniq'"
            ") THEN "
            "ALTER TABLE inventory_healthcheckresponse "
            "ADD CONSTRAINT inventory_healthcheckresponse_session_employee_asset_uniq "
            "UNIQUE (session_id, employee_id, asset_id); "
            "END IF; "
            "END $$;"
        )


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0009_healthchecksession_healthcheckresponse_and_more'),
    ]

    operations = [
        migrations.RunPython(repair_healthcheck_schema, migrations.RunPython.noop),
    ]
