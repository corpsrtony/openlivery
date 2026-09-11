"""Add favicon, support WhatsApp number and social links to Agency."""
from alembic import op
import sqlalchemy as sa

revision = "0041_agency_branding_extras"
down_revision = "0040_telegram_channels"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("agencies", sa.Column("favicon_data", sa.LargeBinary(), nullable=True))
    op.add_column("agencies", sa.Column("favicon_mime", sa.String(100), nullable=True))
    op.add_column("agencies", sa.Column("support_whatsapp", sa.String(30), nullable=False, server_default=""))
    op.add_column("agencies", sa.Column("social_links", sa.JSON(), nullable=False, server_default="{}"))


def downgrade():
    op.drop_column("agencies", "social_links")
    op.drop_column("agencies", "support_whatsapp")
    op.drop_column("agencies", "favicon_mime")
    op.drop_column("agencies", "favicon_data")
