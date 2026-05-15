from collections.abc import Iterable
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.logging import logger
from app.deps import get_current_user, get_db, require_roles
from app.models import Order, OrderItem, OrderStatus, PaymentStatus, Product, Store, User, UserRole
from app.routers.notifications import notify
from app.schemas import OrderCreate, OrderItemCreate, OrderItemRead, OrderRead, OrderStatusUpdate


router = APIRouter(prefix="/orders", tags=["orders"])

STORE_ALLOWED_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.pending: {OrderStatus.accepted, OrderStatus.cancelled},
    OrderStatus.accepted: {OrderStatus.preparing, OrderStatus.cancelled},
    OrderStatus.preparing: {OrderStatus.cancelled},
}
DELIVERY_ALLOWED_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.in_delivery: {OrderStatus.delivered, OrderStatus.cancelled},
}


def normalize_order_items(items: Iterable[OrderItemCreate]) -> dict[int, int]:
    normalized: dict[int, int] = {}
    for item in items:
        normalized[item.product_id] = normalized.get(item.product_id, 0) + item.quantity
    return normalized


def describe_statuses(statuses: set[OrderStatus]) -> str:
    return ", ".join(status.value for status in sorted(statuses, key=lambda item: item.value))


def validate_transition(
    *,
    current_status: OrderStatus,
    new_status: OrderStatus,
    allowed_transitions: dict[OrderStatus, set[OrderStatus]],
    actor_label: str,
) -> None:
    if current_status == new_status:
        return

    allowed = allowed_transitions.get(current_status, set())
    if new_status not in allowed:
        allowed_text = describe_statuses(allowed) or "no further transitions"
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid status transition from {current_status.value} to {new_status.value} "
                f"for {actor_label}. Allowed next statuses: {allowed_text}"
            ),
        )


def serialize_order(order: Order) -> OrderRead:
    return OrderRead(
        id=order.id,
        customer_id=order.customer_id,
        store_id=order.store_id,
        delivery_person_id=order.delivery_person_id,
        status=order.status,
        payment_status=order.payment_status,
        payment_id=order.payment_id,
        checkout_url=order.checkout_url,
        delivery_address=order.delivery_address,
        delivery_current_latitude=order.delivery_current_latitude,
        delivery_current_longitude=order.delivery_current_longitude,
        delivery_location_updated_at=order.delivery_location_updated_at,
        delivery_latitude=order.delivery_latitude,
        delivery_longitude=order.delivery_longitude,
        notes=order.notes,
        total_amount=order.total_amount,
        created_at=order.created_at,
        items=[
            OrderItemRead(
                id=item.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=item.unit_price,
                product_name=item.product.name,
            )
            for item in order.items
        ],
    )


@router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.customer, UserRole.mechanic)),
) -> OrderRead:
    store = db.get(Store, payload.store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    if not payload.items:
        raise HTTPException(status_code=400, detail="Order must include at least one item")

    requested_quantities = normalize_order_items(payload.items)

    products = list(
        db.scalars(
            select(Product)
            .where(
                Product.store_id == payload.store_id,
                Product.id.in_(requested_quantities),
            )
            .with_for_update()  # lock de linha: evita race condition na dedução de estoque
        )
    )
    products_by_id = {product.id: product for product in products}

    for product_id, quantity in requested_quantities.items():
        product = products_by_id.get(product_id)
        if not product:
            raise HTTPException(
                status_code=400,
                detail=f"Product {product_id} does not belong to this store",
            )
        if product.stock < quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for product {product.name}",
            )

    order = Order(
        customer_id=current_user.id,
        store_id=payload.store_id,
        status=OrderStatus.pending,
        delivery_address=payload.delivery_address,
        delivery_latitude=payload.delivery_latitude,
        delivery_longitude=payload.delivery_longitude,
        notes=payload.notes,
        total_amount=Decimal("0.00"),
    )
    db.add(order)
    db.flush()

    total = Decimal("0.00")
    for product_id, quantity in requested_quantities.items():
        product = products_by_id[product_id]
        product.stock -= quantity
        order_item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            quantity=quantity,
            unit_price=product.price,
        )
        db.add(order_item)
        total += Decimal(product.price) * quantity

    order.total_amount = total
    notify(db, user_id=store.owner_id, notification_type="order_received", order_id=order.id)
    db.commit()

    logger.info("order_created", order_id=order.id, customer_id=current_user.id, store_id=payload.store_id, total=str(total))

    saved_order = (
        db.execute(
            select(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .where(Order.id == order.id)
        )
        .unique()
        .scalar_one()
    )
    return serialize_order(saved_order)


@router.get("/my", response_model=list[OrderRead])
def my_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[OrderRead]:
    stmt = (
        select(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .order_by(Order.created_at.desc())
    )

    if current_user.role in {UserRole.customer, UserRole.mechanic}:
        stmt = stmt.where(Order.customer_id == current_user.id)
    elif current_user.role == UserRole.store:
        store = db.scalar(select(Store).where(Store.owner_id == current_user.id))
        if not store:
            return []
        stmt = stmt.where(Order.store_id == store.id)
    elif current_user.role == UserRole.delivery:
        stmt = stmt.where(Order.delivery_person_id == current_user.id)

    orders = db.scalars(stmt).unique().all()
    return [serialize_order(order) for order in orders]


@router.patch("/{order_id}/status", response_model=OrderRead)
def update_order_status(
    order_id: int,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> OrderRead:
    order = (
        db.execute(
            select(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .where(Order.id == order_id)
        )
        .unique()
        .scalar_one_or_none()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if current_user.role == UserRole.store:
        store = db.scalar(select(Store).where(Store.owner_id == current_user.id))
        if not store or store.id != order.store_id:
            raise HTTPException(status_code=403, detail="Order does not belong to your store")
        validate_transition(
            current_status=order.status,
            new_status=payload.status,
            allowed_transitions=STORE_ALLOWED_TRANSITIONS,
            actor_label="store",
        )
        if payload.status == OrderStatus.accepted and order.payment_status != PaymentStatus.approved:
            raise HTTPException(
                status_code=400,
                detail="Pagamento ainda não aprovado. Aguarde a confirmação do Mercado Pago.",
            )
    elif current_user.role == UserRole.delivery:
        if order.delivery_person_id != current_user.id:
            raise HTTPException(status_code=403, detail="Order not assigned to you")
        validate_transition(
            current_status=order.status,
            new_status=payload.status,
            allowed_transitions=DELIVERY_ALLOWED_TRANSITIONS,
            actor_label="delivery",
        )
    else:
        raise HTTPException(status_code=403, detail="Role cannot update order status")

    previous_status = order.status
    order.status = payload.status

    _dispatch_status_notifications(db, order=order, new_status=payload.status)

    db.commit()
    db.refresh(order)

    logger.info("order_status_changed", order_id=order_id, from_status=previous_status.value, to_status=payload.status.value, actor_id=current_user.id)

    return serialize_order(order)


def _dispatch_status_notifications(db: Session, *, order: Order, new_status: OrderStatus) -> None:
    """Notifica os participantes do pedido conforme o novo status."""
    customer_id = order.customer_id
    store = db.scalar(select(Store).where(Store.id == order.store_id))
    store_owner_id = store.owner_id if store else None

    # notificações voltadas ao cliente
    customer_map: dict[OrderStatus, str] = {
        OrderStatus.accepted:    "order_accepted",
        OrderStatus.preparing:   "order_preparing",
        OrderStatus.delivered:   "order_delivered",
        OrderStatus.cancelled:   "order_cancelled",
    }
    if new_status in customer_map:
        notify(db, user_id=customer_id, notification_type=customer_map[new_status], order_id=order.id)

    # notificações voltadas à loja
    if store_owner_id and new_status in {OrderStatus.delivered, OrderStatus.cancelled}:
        notify(db, user_id=store_owner_id, notification_type=f"order_{new_status.value}", order_id=order.id)
