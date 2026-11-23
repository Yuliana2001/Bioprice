import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import quote

from app.core.config import Settings


def email_provider_configured(settings: Settings) -> bool:
    username = (settings.smtp_username or "").strip()
    password = (
        settings.smtp_password.get_secret_value().strip()
        if settings.smtp_password is not None
        else ""
    )
    if settings.environment == "production" and not settings.smtp_starttls:
        return False
    return bool(settings.smtp_host and settings.smtp_sender) and bool(username) == bool(password)


def send_password_reset_email(
    settings: Settings,
    recipient: str,
    token: str,
) -> None:
    if not email_provider_configured(settings):
        raise RuntimeError("El proveedor de correo no está configurado.")

    reset_url = (
        f"{settings.frontend_base_url.rstrip('/')}/restablecer"
        f"#token={quote(token, safe='')}"
    )
    message = EmailMessage()
    message["Subject"] = "Restablecimiento de contraseña de BioPrice BI"
    message["From"] = str(settings.smtp_sender)
    message["To"] = recipient
    message.set_content(
        "Se solicitó restablecer la contraseña de tu cuenta de BioPrice BI.\n\n"
        f"Usa este enlace una sola vez y dentro del tiempo de vigencia: {reset_url}\n\n"
        "Si no solicitaste este cambio, puedes ignorar este mensaje."
    )

    with smtplib.SMTP(
        settings.smtp_host,
        settings.smtp_port,
        timeout=settings.smtp_timeout_seconds,
    ) as server:
        if settings.smtp_starttls:
            server.starttls(context=ssl.create_default_context())
        if settings.smtp_username and settings.smtp_password:
            server.login(
                settings.smtp_username,
                settings.smtp_password.get_secret_value(),
            )
        server.send_message(message)
