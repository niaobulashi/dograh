"""Add preview_audio_url to vendor_voices for a local MinIO mirror of the preview mp3.

The original `preview_url` column points at the vendor's CDN (e.g.
hailuoai.com). To stop depending on an external host that may rate-limit,
expire, or block requests, we copy each sample mp3 into local MinIO and keep
the resulting public URL in `preview_audio_url`. The copy is performed
out-of-band by scripts/transfer_vendor_voices_previews.py; the API's
MiniMaxVoiceCatalog prefers this column over `preview_url` when present.

Revision ID: c1d2e3f4a5b6
Revises: f2c4a9e1b7d3
"""

import sqlalchemy as sa
from alembic import op

revision = "c1d2e3f4a5b6"
down_revision = "f2c4a9e1b7d3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "vendor_voices",
        sa.Column("preview_audio_url", sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_column("vendor_voices", "preview_audio_url")
