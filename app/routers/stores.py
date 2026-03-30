from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_db, require_roles
from app.models import Store, User, UserRole
from app.schemas import StoreCreate, StoreRead


router = APIRouter(prefix="/stores", tags=["stores"])


@router.post("", response_model=StoreRead, status_code=status.HTTP_201_CREATED)
def create_store(
    payload: StoreCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.store)),
) -> Store:
    existing_store = db.scalar(select(Store).where(Store.owner_id == current_user.id))
    if existing_store:
        raise HTTPException(status_code=400, detail="Store owner already has a registered store")

    store = Store(owner_id=current_user.id, **payload.model_dump())
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


@router.get("", response_model=list[StoreRead])
def list_stores(db: Session = Depends(get_db)) -> list[Store]:
    return list(db.scalars(select(Store).order_by(Store.created_at.desc())))
