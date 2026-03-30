from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.deps import get_db
from app.models import Order, OrderItem, OrderStatus, Product, Store, User, UserRole


router = APIRouter(prefix="/demo", tags=["demo"])


def build_summary(db: Session) -> dict[str, object]:
    total_stores = db.scalar(select(func.count()).select_from(Store)) or 0
    total_products = db.scalar(select(func.count()).select_from(Product)) or 0
    total_orders = db.scalar(select(func.count()).select_from(Order)) or 0
    total_delivery_users = db.scalar(
        select(func.count()).select_from(User).where(User.role == UserRole.delivery)
    ) or 0
    available_deliveries = db.scalar(
        select(func.count())
        .select_from(Order)
        .where(
            Order.status.in_([OrderStatus.pending, OrderStatus.accepted]),
            Order.delivery_person_id.is_(None),
        )
    ) or 0
    in_delivery = db.scalar(
        select(func.count()).select_from(Order).where(Order.status == OrderStatus.in_delivery)
    ) or 0
    delivered = db.scalar(
        select(func.count()).select_from(Order).where(Order.status == OrderStatus.delivered)
    ) or 0
    low_stock = db.scalar(
        select(func.count()).select_from(Product).where(Product.stock <= 3)
    ) or 0
    gross_volume = db.scalar(
        select(func.coalesce(func.sum(Order.total_amount), 0)).select_from(Order)
    ) or 0

    recent_orders = db.execute(
        select(
            Order.id,
            Order.status,
            Order.total_amount,
            Order.delivery_address,
            Store.name.label("store_name"),
            User.name.label("customer_name"),
        )
        .join(Store, Store.id == Order.store_id)
        .join(User, User.id == Order.customer_id)
        .order_by(Order.created_at.desc())
        .limit(5)
    ).all()

    featured_products = db.execute(
        select(
            Product.id,
            Product.name,
            Product.price,
            Product.stock,
            Store.name.label("store_name"),
        )
        .join(Store, Store.id == Product.store_id)
        .order_by(Product.stock.desc(), Product.created_at.desc())
        .limit(4)
    ).all()

    return {
        "metrics": {
            "stores": total_stores,
            "products": total_products,
            "orders": total_orders,
            "delivery_users": total_delivery_users,
            "available_deliveries": available_deliveries,
            "in_delivery": in_delivery,
            "delivered": delivered,
            "low_stock": low_stock,
            "gross_volume": float(Decimal(gross_volume)),
        },
        "recent_orders": [
            {
                "id": row.id,
                "status": row.status,
                "total_amount": float(Decimal(row.total_amount)),
                "delivery_address": row.delivery_address,
                "store_name": row.store_name,
                "customer_name": row.customer_name,
            }
            for row in recent_orders
        ],
        "featured_products": [
            {
                "id": row.id,
                "name": row.name,
                "price": float(Decimal(row.price)),
                "stock": row.stock,
                "store_name": row.store_name,
            }
            for row in featured_products
        ],
        "demo_users": {
            "store": "store@demo.com / 123456",
            "customer": "customer@demo.com / 123456",
            "delivery": "delivery@demo.com / 123456",
        },
    }


@router.post("/seed")
def seed_demo(db: Session = Depends(get_db)) -> dict[str, object]:
    existing_store = db.scalar(select(User).where(User.email == "store@demo.com"))
    if existing_store:
        return {"message": "Demo data already exists", **build_summary(db)}

    store_user = User(
        name="AutoPecas Centro",
        email="store@demo.com",
        password_hash=hash_password("123456"),
        role=UserRole.store,
    )
    customer_user = User(
        name="Mecanico Demo",
        email="customer@demo.com",
        password_hash=hash_password("123456"),
        role=UserRole.mechanic,
        latitude=-23.561684,
        longitude=-46.625378,
    )
    delivery_user = User(
        name="Entregador Demo",
        email="delivery@demo.com",
        password_hash=hash_password("123456"),
        role=UserRole.delivery,
        latitude=-23.563210,
        longitude=-46.654250,
    )
    db.add_all([store_user, customer_user, delivery_user])
    db.flush()

    store = Store(
        owner_id=store_user.id,
        name="AutoPecas Centro",
        address="Rua das Oficinas, 100",
        city="Sao Paulo",
        latitude=-23.550520,
        longitude=-46.633308,
    )
    db.add(store)
    db.flush()

    products = [
        Product(
            store_id=store.id,
            name="Pastilha de Freio Dianteira",
            sku="PF-001",
            brand="Bosch",
            vehicle_model="Gol",
            description="Jogo com 4 pastilhas para uso urbano.",
            price=189.90,
            stock=8,
        ),
        Product(
            store_id=store.id,
            name="Filtro de Oleo",
            sku="FO-010",
            brand="Mann",
            vehicle_model="Onix",
            description="Filtro de oleo de alta durabilidade.",
            price=39.90,
            stock=15,
        ),
        Product(
            store_id=store.id,
            name="Bateria 60Ah",
            sku="BAT-060",
            brand="Moura",
            vehicle_model="Universal",
            description="Bateria automotiva 12V.",
            price=429.90,
            stock=5,
        ),
    ]
    db.add_all(products)
    db.flush()

    order = Order(
        customer_id=customer_user.id,
        store_id=store.id,
        status=OrderStatus.accepted,
        delivery_address="Av. Paulista, 1000",
        delivery_latitude=-23.561684,
        delivery_longitude=-46.655981,
        notes="Pedido gerado para demonstracao",
        total_amount=229.80,
    )
    db.add(order)
    db.flush()

    db.add_all(
        [
            OrderItem(order_id=order.id, product_id=products[0].id, quantity=1, unit_price=189.90),
            OrderItem(order_id=order.id, product_id=products[1].id, quantity=1, unit_price=39.90),
        ]
    )
    db.commit()

    return {
        "message": "Demo data created",
        "store_id": store.id,
        "product_ids": [product.id for product in products],
        "demo_order_id": order.id,
        **build_summary(db),
    }


@router.get("/summary")
def demo_summary(db: Session = Depends(get_db)) -> dict[str, object]:
    return build_summary(db)
