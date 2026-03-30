from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.deps import get_current_user, get_db, require_roles
from app.models import Order, OrderItem, OrderStatus, Product, Store, User, UserRole
from app.schemas import OrderCreate, OrderItemRead, OrderRead, OrderStatusUpdate


router = APIRouter(prefix="/orders", tags=["orders"])


def serialize_order(order: Order) -> OrderRead:
    return OrderRead(
        id=order.id,
        customer_id=order.customer_id,
        store_id=order.store_id,
        delivery_person_id=order.delivery_person_id,
        status=order.status,
        delivery_address=order.delivery_address,
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

    products = list(
        db.scalars(
            select(Product).where(
                Product.store_id == payload.store_id,
                Product.id.in_([item.product_id for item in payload.items]),
            )
        )
    )
    products_by_id = {product.id: product for product in products}

    for item in payload.items:
        product = products_by_id.get(item.product_id)
        if not product:
            raise HTTPException(
                status_code=400,
                detail=f"Product {item.product_id} does not belong to this store",
            )
        if product.stock < item.quantity:
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
    for item in payload.items:
        product = products_by_id[item.product_id]
        product.stock -= item.quantity
        order_item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            quantity=item.quantity,
            unit_price=product.price,
        )
        db.add(order_item)
        total += Decimal(product.price) * item.quantity

    order.total_amount = total
    db.commit()

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
    elif current_user.role == UserRole.delivery:
        if order.delivery_person_id != current_user.id:
            raise HTTPException(status_code=403, detail="Order not assigned to you")
    else:
        raise HTTPException(status_code=403, detail="Role cannot update order status")

    order.status = payload.status
    db.commit()
    db.refresh(order)
    return serialize_order(order)
