"""Add pairing_code to whatsapp_channels for phone-number linking (no QR)."""
from alembic import op
import sqlalchemy as sa

revision = "0039_whatsapp_pairing_code"
down_revision = "0038_whatsapp_coexistence"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("whatsapp_channels", sa.Column("pairing_code", sa.String(20), nullable=True))


def downgrade():
    op.drop_column("whatsapp_channels", "pairing_code")
