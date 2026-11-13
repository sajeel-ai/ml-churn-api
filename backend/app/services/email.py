import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> None:
    """Send a plain-text email using the configured backend."""
    if settings.email_backend == "smtp":
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = settings.email_from, to, subject
        msg.set_content(body)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        return
    # Development only: the message (including links) is written to the log.
    logger.warning("EMAIL (console backend) to=%s subject=%s\n%s", to, subject, body)


def send_reset_email(to: str, token: str) -> None:
    link = f"{settings.frontend_base_url}/reset-password?token={token}"
    send_email(to, "Reset your password",
               f"Use this link to reset your password. It expires in "
               f"{settings.reset_token_ttl_minutes} minutes:\n\n{link}\n\n"
               "If you did not request this, you can ignore this email.")


def send_verify_email(to: str, token: str) -> None:
    link = f"{settings.frontend_base_url}/verify-email?token={token}"
    send_email(to, "Verify your email address",
               f"Confirm your email address:\n\n{link}\n")
