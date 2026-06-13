"""Email + OTP helpers for signup verification.

Uses the standard-library smtplib so we add no dependency. When SMTP is not
configured the OTP is logged and surfaced to the caller (dev_otp) so the demo
runs without a mail server — the same graceful-degradation stance as the Groq
narration layer.

Logging is intentionally loud (INFO/ERROR with full tracebacks) so a failed
send is always diagnosable from the server console.
"""

import logging
import secrets
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("mini_erp.email")


def generate_otp() -> str:
    """A numeric one-time code of OTP_LENGTH digits (cryptographically random)."""
    upper = 10**settings.OTP_LENGTH
    return f"{secrets.randbelow(upper):0{settings.OTP_LENGTH}d}"


def smtp_status() -> str:
    """Human-readable one-liner describing the active email mode (for startup logs)."""
    if not settings.smtp_configured:
        return "Email: DEV FALLBACK (no SMTP_HOST set) — OTP codes are logged + returned as dev_otp."
    return (
        f"Email: SMTP {settings.SMTP_HOST}:{settings.SMTP_PORT} "
        f"(TLS={settings.SMTP_USE_TLS}, user={settings.SMTP_USER or '<none>'})"
    )


def _build_message(to_email: str, code: str) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = f"Your Mini ERP verification code: {code}"
    msg["From"] = settings.SMTP_FROM.strip()
    msg["To"] = to_email
    minutes = settings.OTP_EXPIRE_MINUTES
    msg.set_content(
        f"Welcome to Mini ERP!\n\n"
        f"Your verification code is: {code}\n\n"
        f"It expires in {minutes} minutes. If you didn't request this, ignore this email."
    )
    return msg


def send_otp(to_email: str, code: str) -> bool:
    """Send the OTP. Returns True if it was dispatched over SMTP, False if it
    fell back to the dev path (caller then exposes the code as dev_otp).

    Every branch logs clearly so failures are visible in the server console.
    """
    if not settings.smtp_configured:
        logger.warning("[email] SMTP not configured — DEV OTP for %s is %s", to_email, code)
        return False

    host = settings.SMTP_HOST.strip()
    port = settings.SMTP_PORT
    # Gmail app passwords are displayed in groups of 4 with spaces; they work
    # either way, but trimming stray edge whitespace from .env is safe.
    password = settings.SMTP_PASSWORD.strip()
    user = settings.SMTP_USER.strip()

    logger.info("[email] Sending OTP to %s via %s:%s (TLS=%s)", to_email, host, port, settings.SMTP_USE_TLS)
    msg = _build_message(to_email, code)
    try:
        with smtplib.SMTP(host, port, timeout=20) as server:
            if settings.SMTP_USE_TLS:
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if user:
                server.login(user, password)
            # send_message returns a dict of per-recipient refusals; empty == all accepted.
            refused = server.send_message(msg)
        if refused:
            logger.error("[email] SMTP accepted the session but REFUSED recipient(s): %s", refused)
            logger.warning("[email] DEV OTP (delivery refused) for %s is %s", to_email, code)
            return False
        logger.info("[email] OTP email accepted by %s for delivery to %s", host, to_email)
        return True
    except smtplib.SMTPAuthenticationError as exc:
        logger.error(
            "[email] SMTP AUTH FAILED for user %s (code %s): %s. "
            "For Gmail use an App Password (not your account password) with 2FA enabled.",
            user, getattr(exc, "smtp_code", "?"), getattr(exc, "smtp_error", exc),
        )
    except (smtplib.SMTPException, OSError) as exc:
        logger.error("[email] SMTP send to %s FAILED: %s: %s", to_email, type(exc).__name__, exc, exc_info=True)
    # Surface the code via the dev path rather than dead-ending the signup.
    logger.warning("[email] DEV OTP (send failed) for %s is %s", to_email, code)
    return False
