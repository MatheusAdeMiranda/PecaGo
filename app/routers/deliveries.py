from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.deps import get_db, require_roles
from app.models import Order, OrderItem, OrderStatus, User, UserRole
from app.routers.orders import serialize_order
from app.schemas import DeliveryAssign, OrderRead


router = APIRouter(prefix="/deliveries", tags=["deliveries"])


@router.get("/available", response_model=list[OrderRead])
def available_deliveries(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.delivery)),
) -> list[OrderRead]:
    orders = db.scalars(
        select(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .where(Order.status.in_([OrderStatus.pending, OrderStatus.accepted]))
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

    order.delivery_person_id = current_user.id
    order.status = OrderStatus.in_delivery
    db.commit()
    db.refresh(order)
    return serialize_order(order)
