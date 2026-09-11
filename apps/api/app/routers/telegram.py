import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Agent, Client, TelegramChannel, User, now_utc
from ..schemas_telegram import TelegramChannelOut, TelegramChannelUpdate
from ..security import decrypt_secret, encrypt_secret
from ..services.telegram import delete_webhook, get_me, set_webhook


router = APIRouter(prefix="/telegram", tags=["Telegram"])


def _channel_for_user(db: Session, user: User, client_id: uuid.UUID) -> TelegramChannel:
    channel = db.scalar(
        select(TelegramChannel).where(
            TelegramChannel.client_id == client_id,
            TelegramChannel.agency_id == user.agency_id,
        )
    )
    if not channel:
        raise HTTPException(status_code=404, detail="This client does not have Telegram configured yet")
    return channel


def _public_channel(channel: TelegramChannel) -> dict:
    webhook_url = f"{get_settings().frontend_url.rstrip('/')}/api/public/telegram/channels/{channel.id}/webhook"
    return {
        "id": channel.id,
        "client_id": channel.client_id,
        "agent_id": channel.agent_id,
        "status": channel.status,
        "bot_username": channel.bot_username,
        "display_name": channel.display_name,
        "has_bot_token": bool(channel.encrypted_bot_token),
        "webhook_url": webhook_url,
        "last_error": channel.last_error,
        "is_enabled": channel.is_enabled,
        "last_connected_at": channel.last_connected_at,
        "created_at": channel.created_at,
        "updated_at": channel.updated_at,
    }


@router.get("/channels/{client_id}", response_model=TelegramChannelOut)
def get_channel(client_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _public_channel(_channel_for_user(db, user, client_id))


@router.put("/channels/{client_id}", response_model=TelegramChannelOut)
def configure_channel(
    client_id: uuid.UUID,
    payload: TelegramChannelUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    client = db.scalar(select(Client).where(Client.id == client_id, Client.agency_id == user.agency_id))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    agent = db.scalar(
        select(Agent).where(
            Agent.id == payload.agent_id,
            Agent.client_id == client.id,
            Agent.agency_id == user.agency_id,
            Agent.deleted_at.is_(None),
        )
    )
    if not agent:
        raise HTTPException(status_code=400, detail="Select an agent that belongs to this client")
    channel = db.scalar(select(TelegramChannel).where(TelegramChannel.client_id == client.id))
    if not channel:
        channel = TelegramChannel(agency_id=user.agency_id, client_id=client.id, agent_id=agent.id)
        db.add(channel)
    channel.agent_id = agent.id
    # A blank token keeps the stored one, so the form can resubmit safely.
    if payload.bot_token:
        channel.encrypted_bot_token = encrypt_secret(payload.bot_token.strip())
        # The token changed: any existing connection is stale until reconnected.
        channel.status = "disconnected"
        channel.bot_username = None
    channel.updated_at = now_utc()
    db.commit()
    db.refresh(channel)
    return _public_channel(channel)


@router.post("/channels/{client_id}/connect", response_model=TelegramChannelOut)
async def connect_channel(client_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    channel = _channel_for_user(db, user, client_id)
    if not channel.encrypted_bot_token:
        raise HTTPException(status_code=400, detail="Save the bot token before connecting")
    token = decrypt_secret(channel.encrypted_bot_token)
    try:
        profile = await get_me(token)
        webhook_url = f"{get_settings().frontend_url.rstrip('/')}/api/public/telegram/channels/{channel.id}/webhook"
        await set_webhook(token, webhook_url, channel.webhook_secret)
    except HTTPException as exc:
        channel.status = "error"
        channel.last_error = str(exc.detail)
        channel.updated_at = now_utc()
        db.commit()
        db.refresh(channel)
        return _public_channel(channel)
    channel.status = "connected"
    channel.bot_username = profile.get("username")
    channel.display_name = profile.get("first_name")
    channel.last_error = None
    channel.is_enabled = True
    channel.last_connected_at = now_utc()
    channel.updated_at = now_utc()
    db.commit()
    db.refresh(channel)
    return _public_channel(channel)


@router.post("/channels/{client_id}/disconnect", response_model=TelegramChannelOut)
async def disconnect_channel(client_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    channel = _channel_for_user(db, user, client_id)
    if channel.encrypted_bot_token:
        await delete_webhook(decrypt_secret(channel.encrypted_bot_token))
    channel.status = "disconnected"
    channel.is_enabled = False
    channel.last_error = None
    channel.updated_at = now_utc()
    db.commit()
    db.refresh(channel)
    return _public_channel(channel)
