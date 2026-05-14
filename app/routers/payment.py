"""
Integração com Mercado Pago.

Fluxo:
1. Cliente chama POST /orders/{id}/payment → recebe checkout_url
2. Cliente paga na página do MP
3. MP chama POST /webhooks/mercadopago com o resultado
4. Webhook atualiza payment_status no pedido

Sandbox:
- Gere um ACCESS_TOKEN de teste em https://www.mercadopago.com.br/developers
- Use cartões de teste: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/cards
"""

import hashlib
import hmac
import json

import mercadopago
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import logger
from app.deps import get_current_user, get_db, require_roles
from app.models import Order, OrderItem, PaymentStatus, Product, User, UserRole
from app.routers.notifications import notify


router = APIRouter(tags=["payment"])


def _mp_sdk() -> mercadopago.SDK:
    if not settings.mercadopago_access_token:
        raise HTTPException(
            status_code=503,
            detail="Pagamento não configurado. Defina MERCADOPAGO_ACCESS_TOKEN no .env.",
        )
    return mercadopago.SDK(settings.mercadopago_access_token)


# ── Schemas ───────────────────────────────────────────────────────────────────

class CheckoutResponse(BaseModel):
    checkout_url: str
    payment_status: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/orders/{order_id}/payment", response_model=CheckoutResponse)
def create_payment(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.customer, UserRole.mechanic)),
) -> CheckoutResponse:
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your order")
    if order.payment_status == PaymentStatus.approved:
        raise HTTPException(status_code=400, detail="Order already paid")

    # Se já tem um checkout_url gerado e ainda está pendente, retorna o mesmo
    if order.checkout_url and order.payment_status == PaymentStatus.pending:
        return CheckoutResponse(
            checkout_url=order.checkout_url,
            payment_status=order.payment_status.value,
        )

    items = db.scalars(select(OrderItem).where(OrderItem.order_id == order_id)).all()
    product_names = {
        p.id: p.name
        for p in db.scalars(
            select(Product).where(Product.id.in_([i.product_id for i in items]))
        )
    }

    preference_items = [
        {
            "id": str(item.product_id),
            "title": product_names.get(item.product_id, f"Produto #{item.product_id}"),
            "quantity": item.quantity,
            "unit_price": float(item.unit_price),
            "currency_id": "BRL",
        }
        for item in items
    ]

    base = settings.app_base_url.rstrip("/")
    preference_data = {
        "items": preference_items,
        "external_reference": str(order_id),
        "back_urls": {
            "success": f"{base}/console?payment=success&order_id={order_id}",
            "failure": f"{base}/console?payment=failure&order_id={order_id}",
            "pending": f"{base}/console?payment=pending&order_id={order_id}",
        },
        "auto_return": "approved",
        "notification_url": f"{base}/webhooks/mercadopago",
        "statement_descriptor": "PecaGo",
        "metadata": {"order_id": order_id, "customer_id": current_user.id},
    }

    sdk = _mp_sdk()
    result = sdk.preference().create(preference_data)

    if result["status"] not in (200, 201):
        logger.error("mp_preference_failed", order_id=order_id, response=result)
        raise HTTPException(status_code=502, detail="Erro ao criar preferência de pagamento.")

    preference = result["response"]
    # Em sandbox usa sandbox_init_point; em produção usa init_point
    checkout_url = preference.get("sandbox_init_point") or preference.get("init_point")

    order.checkout_url = checkout_url
    db.commit()

    logger.info("payment_created", order_id=order_id, preference_id=preference.get("id"))
    return CheckoutResponse(checkout_url=checkout_url, payment_status=order.payment_status.value)


@router.post("/webhooks/mercadopago", status_code=200)
async def mercadopago_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_signature: str = Header(default=""),
    x_request_id: str = Header(default=""),
) -> dict:
    body = await request.body()

    # Valida assinatura quando o secret está configurado
    if settings.mercadopago_webhook_secret:
        signed_template = f"id={x_request_id};request-id={x_request_id};ts={x_request_id};"
        expected = hmac.new(
            settings.mercadopago_webhook_secret.encode(),
            signed_template.encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(x_signature, expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # O MP envia diferentes formatos; normalizamos para o campo "data.id"
    event_type = data.get("type", "")
    resource_id = data.get("data", {}).get("id") or data.get("resource", "").rsplit("/", 1)[-1]

    if event_type not in ("payment",) or not resource_id:
        return {"received": True}

    sdk = _mp_sdk()
    payment_info = sdk.payment().get(resource_id)

    if payment_info["status"] != 200:
        logger.warning("mp_payment_fetch_failed", resource_id=resource_id)
        return {"received": True}

    payment = payment_info["response"]
    order_id_str = str(payment.get("external_reference", ""))
    mp_status = payment.get("status", "")
    mp_payment_id = str(payment.get("id", ""))

    if not order_id_str.isdigit():
        return {"received": True}

    order = db.get(Order, int(order_id_str))
    if not order:
        return {"received": True}

    new_payment_status = _map_mp_status(mp_status)
    if new_payment_status == order.payment_status:
        return {"received": True}

    order.payment_status = new_payment_status
    order.payment_id = mp_payment_id

    if new_payment_status == PaymentStatus.approved:
        notify(db, user_id=order.customer_id, notification_type="payment_approved", order_id=order.id)
    elif new_payment_status == PaymentStatus.rejected:
        notify(db, user_id=order.customer_id, notification_type="payment_rejected", order_id=order.id)

    db.commit()
    logger.info("payment_updated", order_id=order.id, payment_status=new_payment_status.value)
    return {"received": True}


def _map_mp_status(mp_status: str) -> PaymentStatus:
    return {
        "approved": PaymentStatus.approved,
        "rejected": PaymentStatus.rejected,
        "cancelled": PaymentStatus.rejected,
        "refunded": PaymentStatus.refunded,
        "charged_back": PaymentStatus.refunded,
    }.get(mp_status, PaymentStatus.pending)
