"""Add vendor_voices table for pre-fetched vendor voice catalogs (MiniMax, ...).

Voices are populated out-of-band (a manual/admin sync) because the source
listings require a logged-in session and cannot be queried per request.

Revision ID: f2c4a9e1b7d3
Revises: d6a83e2b19f0
"""

import sqlalchemy as sa
from alembic import op

revision = "f2c4a9e1b7d3"
down_revision = "d6a83e2b19f0"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "vendor_voices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("voice_id", sa.String(128), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("gender", sa.String(16), nullable=True),
        sa.Column("language", sa.String(16), nullable=True),
        sa.Column("age", sa.String(16), nullable=True),
        sa.Column("accent", sa.String(64), nullable=True),
        sa.Column("preview_url", sa.Text(), nullable=True),
        sa.Column("sample_text", sa.Text(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_vendor_voices_provider_voice", "vendor_voices", ["provider", "voice_id"]
    )
    op.create_index(
        "ix_vendor_voices_provider_language", "vendor_voices", ["provider", "language"]
    )
    op.create_index(
        "ix_vendor_voices_provider_gender", "vendor_voices", ["provider", "gender"]
    )
    op.create_index(
        "ix_vendor_voices_provider_age", "vendor_voices", ["provider", "age"]
    )


def downgrade():
    op.drop_index("ix_vendor_voices_provider_age", table_name="vendor_voices")
    op.drop_index("ix_vendor_voices_provider_gender", table_name="vendor_voices")
    op.drop_index("ix_vendor_voices_provider_language", table_name="vendor_voices")
    op.drop_constraint(
        "uq_vendor_voices_provider_voice", "vendor_voices", type_="unique"
    )
    op.drop_table("vendor_voices")
