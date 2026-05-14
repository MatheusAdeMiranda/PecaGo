from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import Notification, User


router = APIRouter(prefix="/notifications", tags=["notifications"])

# ── Tipos de notificação ──────────────────────────────────────────────────────
# order_received   → loja: novo pedido recebido
# order_accepted   → cliente: pedido aceito
# order_preparing  → cliente: pedido em separação
# order_in_delivery → cliente: pedido saiu para entrega
# order_delivered  → cliente + loja: pedido entregue
# order_cancelled  → cliente + loja: pedido cancelado


_MESSAGES: dict[str, str] = {
    "order_received":    "Novo pedido #{order_id} recebido.",
    "order_accepted":    "Pedido #{order_id} foi aceito pela loja.",
    "order_preparing":   "Pedido #{order_id} está sendo preparado.",
    "order_in_delivery": "Pedido #{order_id} saiu para entrega.",
    "order_delivered":   "Pedido #{order_id} foi entregue.",
    "order_cancelled":   "Pedido #{order_id} foi cancelado.",
}


def notify(db: Session, *, user_id: int, notification_type: str, order_id: int) -> None:
    """Cria uma notificação para o usuário. Silencia se o tipo não existir."""
    template = _MESSAGES.get(notification_type)
    if not template:
        return
    db.add(Notification(
        user_id=user_id,
        type=notification_type,
        payload={
            "order_id": order_id,
            "message": template.format(order_id=order_id),
        },
    ))


# ── Schemas ───────────────────────────────────────────────────────────────────

class NotificationRead(BaseModel):
    id: int
    type: str
    payload: dict
    read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UnreadCount(BaseModel):
    unread: int


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[NotificationRead])
def list_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Notification]:
    return list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == current_user.id)
            .order_by(Notification.created_at.desc())
            .limit(50)
        )
    )


@router.get("/unread-count", response_model=UnreadCount)
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnreadCount:
    count = db.scalars(
        select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.read.is_(False),
        )
    )
    return UnreadCount(unread=sum(1 for _ in count))


@router.patch("/{notification_id}/read", response_model=NotificationRead)
def mark_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Notification:
    notification = db.get(Notification, notification_id)
    if not notification or notification.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.read = True
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/read-all", status_code=204)
def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    notifications = db.scalars(
        select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.read.is_(False),
        )
    )
    for n in notifications:
        n.read = True
    db.commit()
