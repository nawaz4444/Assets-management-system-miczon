from django.db import migrations, models


def ensure_reason_for_request(apps, schema_editor):
    table = 'inventory_assetactionrequest'
    quote = schema_editor.quote_name
    with schema_editor.connection.cursor() as cursor:
        columns = {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(cursor, table)
        }

    if 'reason_for_request' not in columns:
        field = models.TextField(blank=True, default='', name='reason_for_request')
        field.set_attributes_from_name('reason_for_request')
        schema_editor.add_field(apps.get_model('inventory', 'AssetActionRequest'), field)
    else:
        schema_editor.execute(
            f"UPDATE {quote(table)} "
            f"SET {quote('reason_for_request')} = COALESCE(NULLIF({quote('reason_for_request')}, ''), {quote('remarks')}, '')"
        )
        if schema_editor.connection.vendor == 'postgresql':
            schema_editor.execute(
                f"ALTER TABLE {quote(table)} ALTER COLUMN {quote('reason_for_request')} SET DEFAULT ''"
            )


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0011_legacy_healthcheck_defaults'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(ensure_reason_for_request, migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='assetactionrequest',
                    name='reason_for_request',
                    field=models.TextField(blank=True),
                ),
            ],
        ),
    ]
