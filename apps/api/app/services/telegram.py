"""Thin client for the Telegram Bot API.

Each channel brings its own bot token (created via @BotFather); it is
decrypted by the caller and never logged. Errors surface as HTTPException
with Telegram's own error description, never the token.
"""

import httpx
from fastapi import HTTPException

MAX_MEDIA_BYTES = 20 * 1024 * 1024
# Telegram's hard limit for a text message body.
MAX_TEXT_LENGTH = 4096
API_TIMEOUT = 30
API_BASE = "https://api.telegram.org"


def _api_url(token: str, method: str) -> str:
    return f"{API_BASE}/bot{token}/{method}"


def _file_url(token: str, file_path: str) -> str:
    return f"{API_BASE}/file/bot{token}/{file_path}"


def _telegram_error(response: httpx.Response) -> str:
    try:
        return response.json().get("description") or f"Telegram API returned status {response.status_code}"
    except ValueError:
        return f"Telegram API returned status {response.status_code}"


async def _request(method: str, url: str, **kwargs) -> httpx.Response:
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
            return await client.request(method, url, **kwargs)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not reach the Telegram API.") from exc


async def get_me(token: str) -> dict:
    """Validate the bot token and return its public profile (username, name)."""
    response = await _request("GET", _api_url(token, "getMe"))
    if response.status_code >= 400 or not response.json().get("ok"):
        raise HTTPException(status_code=502, detail=f"Credential check failed: {_telegram_error(response)}")
    return response.json()["result"]


async def set_webhook(token: str, url: str, secret: str) -> None:
    """Point the bot at our webhook, authenticated with a secret Telegram
    echoes back on every call (X-Telegram-Bot-Api-Secret-Token header)."""
    response = await _request(
        "POST",
        _api_url(token, "setWebhook"),
        json={"url": url, "secret_token": secret, "allowed_updates": ["message"]},
    )
    if response.status_code >= 400 or not response.json().get("ok"):
        raise HTTPException(status_code=502, detail=f"Could not register the webhook: {_telegram_error(response)}")


async def delete_webhook(token: str) -> None:
    """Best-effort: disconnecting should succeed locally even if the bot
    token was since revoked and Telegram no longer accepts calls for it."""
    try:
        await _request("POST", _api_url(token, "deleteWebhook"))
    except HTTPException:
        pass


async def send_text(token: str, chat_id: str, text: str, reply_to_message_id: str | None = None) -> str | None:
    """Send a text message; returns the outbound message id."""
    payload: dict = {"chat_id": chat_id, "text": text[:MAX_TEXT_LENGTH]}
    if reply_to_message_id:
        payload["reply_parameters"] = {"message_id": reply_to_message_id, "allow_sending_without_reply": True}
    response = await _request("POST", _api_url(token, "sendMessage"), json=payload)
    if response.status_code >= 400 or not response.json().get("ok"):
        raise HTTPException(status_code=502, detail=f"Telegram could not send the message: {_telegram_error(response)}")
    return str(response.json()["result"]["message_id"])


async def fetch_file(token: str, file_id: str) -> tuple[bytes, str]:
    """Download an inbound media file: resolve its path, then fetch it.
    Returns (data, filename) — Telegram's getFile has no mime type, so the
    caller infers it from the message type and this filename's extension."""
    lookup = await _request("GET", _api_url(token, "getFile"), params={"file_id": file_id})
    if lookup.status_code >= 400 or not lookup.json().get("ok"):
        raise HTTPException(status_code=502, detail=f"Could not resolve the file: {_telegram_error(lookup)}")
    file_path = lookup.json()["result"].get("file_path") or ""
    if not file_path:
        raise HTTPException(status_code=502, detail="Invalid file response from the Telegram API.")
    download = await _request("GET", _file_url(token, file_path))
    if download.status_code >= 400 or len(download.content) > MAX_MEDIA_BYTES:
        raise HTTPException(status_code=502, detail="Could not download the file.")
    return download.content, file_path.rsplit("/", 1)[-1]
