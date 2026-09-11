"""Add telegram_channels and Conversation.telegram_channel_id."""
from alembic import op
import sqlalchemy as sa

revision = "0040_telegram_channels"
down_revision = "0039_whatsapp_pairing_code"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "telegram_channels",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("agency_id", sa.Uuid(), sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.Uuid(), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", sa.Uuid(), sa.ForeignKey("agents.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="disconnected"),
        sa.Column("bot_username", sa.String(80), nullable=True),
        sa.Column("display_name", sa.String(180), nullable=True),
        sa.Column("encrypted_bot_token", sa.Text(), nullable=True),
        sa.Column("webhook_secret", sa.String(64), nullable=False, server_default=""),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("client_id", name="uq_telegram_channels_client_id"),
    )
    for column in ("agency_id", "client_id", "agent_id"):
        op.create_index(f"ix_telegram_channels_{column}", "telegram_channels", [column])

    op.add_column(
        "conversations",
        sa.Column("telegram_channel_id", sa.Uuid(), sa.ForeignKey("telegram_channels.id", ondelete="CASCADE"), nullable=True),
    )
    op.create_index("ix_conversations_telegram_channel_id", "conversations", ["telegram_channel_id"])
    op.create_index("ix_conversations_telegram_chat", "conversations", ["telegram_channel_id", "external_chat_id"])


def downgrade():
    op.drop_index("ix_conversations_telegram_chat", table_name="conversations")
    op.drop_index("ix_conversations_telegram_channel_id", table_name="conversations")
    op.drop_column("conversations", "telegram_channel_id")
    for column in ("agent_id", "client_id", "agency_id"):
        op.drop_index(f"ix_telegram_channels_{column}", table_name="telegram_channels")
    op.drop_table("telegram_channels")
