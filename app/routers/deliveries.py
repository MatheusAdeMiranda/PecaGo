import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.deps import get_current_user, get_db, require_roles
from app.models import Order, OrderItem, OrderStatus, User, UserRole
from app.routers.notifications import notify
from app.routers.orders import serialize_order
from app.schemas import DeliveryAssign, LocationUpdate, OrderRead, TrackingSnapshot


router = APIRouter(prefix="/deliveries", tags=["deliveries"])

READY_FOR_DELIVERY_STATUSES = {OrderStatus.accepted, OrderStatus.preparing}


@router.get("/available", response_model=list[OrderRead])
def available_deliveries(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.delivery)),
) -> list[OrderRead]:
    orders = db.scalars(
        select(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .where(
            Order.status.in_(READY_FOR_DELIVERY_STATUSES),
            Order.delivery_person_id.is_(None),
        )
        .order_by(Order.created_at.asc())
    ).unique().all()
    return [serialize_order(order) for order in orders]


@router.post("/assign", response_model=OrderRead)
def assign_delivery(
    payload: DeliveryAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.delivery)),
) -> OrderRead:
    order = (
        db.execute(
            select(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .where(Order.id == payload.order_id)
        )
        .unique()
        .scalar_one_or_none()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.delivery_person_id and order.delivery_person_id != current_user.id:
        raise HTTPException(status_code=400, detail="Order already assigned")
    if order.delivery_person_id == current_user.id and order.status == OrderStatus.in_delivery:
        return serialize_order(order)
    if order.status not in READY_FOR_DELIVERY_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Order is not ready for delivery assignment",
        )

    order.delivery_person_id = current_user.id
    order.status = OrderStatus.in_delivery
    notify(db, user_id=order.customer_id, notification_type="order_in_delivery", order_id=order.id)
    db.commit()
    db.refresh(order)
    return serialize_order(order)


@router.patch("/{order_id}/location", response_model=TrackingSnapshot)
def update_location(
    order_id: int,
    payload: LocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.delivery)),
) -> TrackingSnapshot:
    """Entregador envia sua posição atual. Chamado pelo app a cada ~5s."""
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.delivery_person_id != current_user.id:
        raise HTTPException(status_code=403, detail="Order not assigned to you")
    if order.status != OrderStatus.in_delivery:
        raise HTTPException(status_code=400, detail="Order is not in delivery")

    order.delivery_current_latitude = payload.latitude
    order.delivery_current_longitude = payload.longitude
    order.delivery_location_updated_at = datetime.now(timezone.utc)
    db.commit()

    return TrackingSnapshot(
        order_id=order.id,
        status=order.status,
        delivery_latitude=order.delivery_latitude,
        delivery_longitude=order.delivery_longitude,
        delivery_current_latitude=order.delivery_current_latitude,
        delivery_current_longitude=order.delivery_current_longitude,
        delivery_location_updated_at=order.delivery_location_updated_at,
    )


@router.get("/{order_id}/track", response_model=TrackingSnapshot)
def get_tracking(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TrackingSnapshot:
    """Snapshot atual da posição do entregador (para polling ou carga inicial do SSE)."""
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if current_user.id not in {order.customer_id, order.delivery_person_id}:
        # loja também pode ver
        from sqlalchemy import select as _select
        from app.models import Store
        store = db.scalar(_select(Store).where(Store.owner_id == current_user.id))
        if not store or store.id != order.store_id:
            raise HTTPException(status_code=403, detail="Access denied")

    return TrackingSnapshot(
        order_id=order.id,
        status=order.status,
        delivery_latitude=order.delivery_latitude,
        delivery_longitude=order.delivery_longitude,
        delivery_current_latitude=order.delivery_current_latitude,
        delivery_current_longitude=order.delivery_current_longitude,
        delivery_location_updated_at=order.delivery_location_updated_at,
    )


@router.get("/{order_id}/track/stream")
async def track_stream(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    SSE — cliente conecta e recebe atualizações de posição a cada 4s.
    Fechar a conexão encerra o stream automaticamente.

    Nota: funciona corretamente em processo único (dev/single-worker).
    Para múltiplos workers em produção, use Redis Pub/Sub na frente deste endpoint.
    """
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if current_user.id not in {order.customer_id, order.delivery_person_id}:
        from sqlalchemy import select as _select
        from app.models import Store
        store = db.scalar(_select(Store).where(Store.owner_id == current_user.id))
        if not store or store.id != order.store_id:
            raise HTTPException(status_code=403, detail="Access denied")

    async def event_generator():
        while True:
            db.expire_all()  # força releitura do banco a cada iteração
            current = db.get(Order, order_id)
            if not current:
                break

            snapshot = TrackingSnapshot(
                order_id=current.id,
                status=current.status,
                delivery_latitude=current.delivery_latitude,
                delivery_longitude=current.delivery_longitude,
                delivery_current_latitude=current.delivery_current_latitude,
                delivery_current_longitude=current.delivery_current_longitude,
                delivery_location_updated_at=current.delivery_location_updated_at,
            )
            yield f"data: {json.dumps(snapshot.model_dump(mode='json'))}\n\n"

            # Encerra automaticamente se o pedido não está mais em entrega
            if current.status not in {OrderStatus.in_delivery}:
                break

            await asyncio.sleep(4)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # desativa buffering em nginx
        },
    )
