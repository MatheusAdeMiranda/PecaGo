from sqlalchemy import func, select
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user, get_db, require_roles
from app.models import Order, OrderStatus, Review, RevieweeType, Store, User, UserRole
from app.schemas import RatingSummary, ReviewCreate, ReviewRead


router = APIRouter(prefix="/reviews", tags=["reviews"])


def _serialize_review(review: Review) -> ReviewRead:
    return ReviewRead(
        id=review.id,
        order_id=review.order_id,
        reviewer_id=review.reviewer_id,
        reviewer_name=review.reviewer.name,
        reviewee_id=review.reviewee_id,
        reviewee_name=review.reviewee.name,
        reviewee_type=review.reviewee_type,
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
    )


def _build_summary(db: Session, reviewee_id: int, reviewee_type: RevieweeType) -> RatingSummary:
    reviews = db.scalars(
        select(Review)
        .where(
            Review.reviewee_id == reviewee_id,
            Review.reviewee_type == reviewee_type,
        )
        .order_by(Review.created_at.desc())
    ).all()

    avg = (
        db.scalar(
            select(func.avg(Review.rating)).where(
                Review.reviewee_id == reviewee_id,
                Review.reviewee_type == reviewee_type,
            )
        )
    )

    return RatingSummary(
        avg_rating=round(float(avg), 2) if avg is not None else None,
        review_count=len(reviews),
        reviews=[_serialize_review(r) for r in reviews],
    )


@router.post("", response_model=ReviewRead, status_code=201)
def create_review(
    payload: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.customer, UserRole.mechanic)),
) -> ReviewRead:
    order = db.get(Order, payload.order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="You are not the customer of this order")
    if order.status != OrderStatus.delivered:
        raise HTTPException(status_code=400, detail="Order must be delivered before reviewing")

    # Determina o reviewee correto
    if payload.reviewee_type == RevieweeType.store:
        store = db.scalar(select(Store).where(Store.id == order.store_id))
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")
        reviewee_id = store.owner_id
    else:
        if not order.delivery_person_id:
            raise HTTPException(status_code=400, detail="Order has no delivery person assigned")
        reviewee_id = order.delivery_person_id

    # Evita avaliação duplicada do mesmo tipo no mesmo pedido
    existing = db.scalar(
        select(Review).where(
            Review.order_id == payload.order_id,
            Review.reviewer_id == current_user.id,
            Review.reviewee_type == payload.reviewee_type,
        )
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"You already reviewed the {payload.reviewee_type.value} for this order",
        )

    review = Review(
        order_id=payload.order_id,
        reviewer_id=current_user.id,
        reviewee_id=reviewee_id,
        reviewee_type=payload.reviewee_type,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return _serialize_review(review)


@router.get("/store/{store_id}", response_model=RatingSummary)
def store_reviews(
    store_id: int,
    db: Session = Depends(get_db),
) -> RatingSummary:
    store = db.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return _build_summary(db, reviewee_id=store.owner_id, reviewee_type=RevieweeType.store)


@router.get("/delivery/{user_id}", response_model=RatingSummary)
def delivery_reviews(
    user_id: int,
    db: Session = Depends(get_db),
) -> RatingSummary:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _build_summary(db, reviewee_id=user_id, reviewee_type=RevieweeType.delivery)
