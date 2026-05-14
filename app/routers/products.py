from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import literal, or_, select
from sqlalchemy.orm import Session

from app.core.storage import upload_image
from app.deps import get_db, require_roles
from app.models import Product, Store, User, UserRole
from app.schemas import ProductCreate, ProductRead, ProductSearchResult


router = APIRouter(prefix="/products", tags=["products"])


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.store)),
) -> Product:
    store = db.scalar(select(Store).where(Store.owner_id == current_user.id))
    if not store:
        raise HTTPException(status_code=400, detail="Create a store before adding products")

    product = Product(store_id=store.id, **payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get("", response_model=list[ProductRead])
def list_products(db: Session = Depends(get_db)) -> list[Product]:
    return list(db.scalars(select(Product).order_by(Product.created_at.desc())))


@router.post("/{product_id}/image", response_model=ProductRead)
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.store)),
) -> Product:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    store = db.scalar(select(Store).where(Store.owner_id == current_user.id))
    if not store or product.store_id != store.id:
        raise HTTPException(status_code=403, detail="Product does not belong to your store")

    try:
        product.image_url = await upload_image(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.commit()
    db.refresh(product)
    return product


@router.get("/search", response_model=list[ProductSearchResult])
def search_products(
    q: str = Query(..., min_length=2),
    latitude: float | None = None,
    longitude: float | None = None,
    city: str | None = None,
    db: Session = Depends(get_db),
) -> list[ProductSearchResult]:
    if latitude is not None and longitude is not None:
        distance_expr = ((Store.latitude - latitude) * (Store.latitude - latitude)) + (
            (Store.longitude - longitude) * (Store.longitude - longitude)
        )
    else:
        distance_expr = literal(0.0)

    stmt = (
        select(
            Product,
            Store.name.label("store_name"),
            Store.city.label("city"),
            distance_expr.label("distance_score"),
        )
        .join(Store, Store.id == Product.store_id)
        .where(
            Product.stock > 0,
            or_(
                Product.name.ilike(f"%{q}%"),
                Product.sku.ilike(f"%{q}%"),
                Product.brand.ilike(f"%{q}%"),
                Product.vehicle_model.ilike(f"%{q}%"),
            ),
        )
        .order_by(distance_expr, Product.price)
    )

    if city:
        stmt = stmt.where(Store.city.ilike(f"%{city}%"))

    results = db.execute(stmt).all()
    return [
        ProductSearchResult(
            id=row.Product.id,
            store_id=row.Product.store_id,
            name=row.Product.name,
            sku=row.Product.sku,
            brand=row.Product.brand,
            vehicle_model=row.Product.vehicle_model,
            description=row.Product.description,
            price=row.Product.price,
            stock=row.Product.stock,
            created_at=row.Product.created_at,
            store_name=row.store_name,
            city=row.city,
            distance_score=float(row.distance_score or 0),
        )
        for row in results
    ]
