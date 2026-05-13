from django.db import migrations


def add_legacy_defaults(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return

    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'inventory_healthchecksession'
            """
        )
        session_columns = {row[0] for row in cursor.fetchall()}
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'inventory_healthcheckresponse'
            """
        )
        response_columns = {row[0] for row in cursor.fetchall()}

    if 'is_active' in session_columns:
        schema_editor.execute(
            "ALTER TABLE inventory_healthchecksession "
            "ALTER COLUMN is_active SET DEFAULT TRUE"
        )

    if 'created_at' in response_columns:
        schema_editor.execute(
            "ALTER TABLE inventory_healthcheckresponse "
            "ALTER COLUMN created_at SET DEFAULT NOW()"
        )

    if 'submitted_at' in response_columns:
        schema_editor.execute(
            "ALTER TABLE inventory_healthcheckresponse "
            "ALTER COLUMN submitted_at SET DEFAULT NOW()"
        )


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0010_repair_healthcheck_schema'),
    ]

    operations = [
        migrations.RunPython(add_legacy_defaults, migrations.RunPython.noop),
    ]
