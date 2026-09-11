import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TelegramChannelUpdate(BaseModel):
    agent_id: uuid.UUID
    # Write-only: omitted or blank keeps the stored token.
    bot_token: str | None = Field(default=None, max_length=200)


class TelegramChannelOut(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    agent_id: uuid.UUID
    status: str
    bot_username: str | None
    display_name: str | None
    has_bot_token: bool
    webhook_url: str
    last_error: str | None
    is_enabled: bool
    last_connected_at: datetime | None
    created_at: datetime
    updated_at: datetime
