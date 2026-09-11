"""Public webhook for the Telegram Bot API channel.

Telegram calls this endpoint directly for every update. Authentication is the
secret_token registered with setWebhook, echoed back on every call in the
X-Telegram-Bot-Api-Secret-Token header — no signature math needed, unlike the
WhatsApp Cloud webhook.
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Message, TelegramChannel, now_utc
from ..security import decrypt_secret
from ..services.telegram import fetch_file, send_text
from ..services.whatsapp_inbound import InboundMessage, process_inbound


public_router = APIRouter(prefix="/public/telegram", tags=["Telegram public"])

logger = logging.getLogger("openlivery.telegram")


def _channel(db: Session, channel_id: uuid.UUID) -> TelegramChannel:
    channel = db.get(TelegramChannel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Unknown channel")
    return channel


def _sender_name(frm: dict) -> str | None:
    name = " ".join(part for part in (frm.get("first_name"), frm.get("last_name")) if part).strip()
    return name or frm.get("username") or None


def _parse_message(message: dict) -> tuple[InboundMessage, str | None] | None:
    """Map one Telegram message to the shared inbound shape, plus the file id
    to download (if any); None to skip."""
    chat = message.get("chat") or {}
    chat_id = str(chat.get("id") or "")
    message_id = str(message.get("message_id") or "")
    if not chat_id or not message_id:
        return None
    base = {
        "external_message_id": message_id,
        "external_chat_id": chat_id,
        "sender_name": _sender_name(message.get("from") or {}),
    }
    reply_to = message.get("reply_to_message") or {}
    if reply_to.get("message_id"):
        base["quoted_external_id"] = str(reply_to["message_id"])

    if "text" in message:
        return InboundMessage(**base, text=message.get("text") or ""), None
    if "photo" in message:
        # Telegram sends the same photo at several resolutions; the last
        # entry in the array is the largest.
        photos = message.get("photo") or []
        if not photos:
            return None
        return (
            InboundMessage(**base, text=message.get("caption") or "", media_kind="image", media_mime="image/jpeg"),
            photos[-1].get("file_id"),
        )
    if "voice" in message:
        voice = message["voice"]
        return (
            InboundMessage(
                **base, text=message.get("caption") or "", media_kind="audio",
                media_mime=voice.get("mime_type") or "audio/ogg",
            ),
            voice.get("file_id"),
        )
    if "video" in message:
        video = message["video"]
        return (
            InboundMessage(
                **base, text=message.get("caption") or "", media_kind="video",
                media_mime=video.get("mime_type") or "video/mp4",
            ),
            video.get("file_id"),
        )
    if "document" in message:
        document = message["document"]
        return (
            InboundMessage(
                **base, text=message.get("caption") or "", media_kind="document",
                media_mime=document.get("mime_type") or "application/octet-stream",
            ),
            document.get("file_id"),
        )
    return None


@public_router.post("/channels/{channel_id}/webhook")
async def receive_webhook(channel_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    channel = _channel(db, channel_id)
    secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") or ""
    if not channel.webhook_secret or secret != channel.webhook_secret:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")

    # From here on always acknowledge with 200: Telegram retries non-2xx
    # responses, and an update that fails once will fail on every retry.
    try:
        update = await request.json()
    except ValueError:
        return {"status": "ok"}
    if not channel.is_enabled or not channel.encrypted_bot_token:
        return {"status": "ok"}

    message = update.get("message")
    if not message:
        return {"status": "ok"}
    parsed = _parse_message(message)
    if not parsed:
        return {"status": "ok"}
    inbound, file_id = parsed

    token = decrypt_secret(channel.encrypted_bot_token)
    if file_id:
        try:
            data, _filename = await fetch_file(token, file_id)
            inbound.media_bytes = data
        except HTTPException:
            inbound.media_bytes = None

    try:
        result = await process_inbound(
            db,
            channel,
            inbound,
            conversation_channel="telegram",
            channel_fk_field="telegram_channel_id",
        )
    except Exception as exc:  # noqa: BLE001 - never break the webhook over one bad update
        channel.last_error = f"An inbound message could not be processed: {str(exc)[:400]}"
        channel.updated_at = now_utc()
        db.commit()
        return {"status": "ok"}
    if not result.reply:
        return {"status": "ok"}
    try:
        message_id = await send_text(
            token, inbound.external_chat_id, result.reply, reply_to_message_id=result.quote_external_id
        )
    except HTTPException as exc:
        channel.last_error = f"The reply could not be sent: {exc.detail}"
        channel.updated_at = now_utc()
        db.commit()
        return {"status": "ok"}
    if message_id and result.outbound_message_id:
        outbound = db.get(Message, result.outbound_message_id)
        if outbound:
            outbound.external_message_id = message_id
            db.commit()
    return {"status": "ok"}
