from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import OrderStatus, UserRole


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: UserRole
    latitude: float | None = None
    longitude: float | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: UserRole
    latitude: float | None
    longitude: float | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StoreCreate(BaseModel):
    name: str
    address: str
    city: str
    latitude: float
    longitude: float


class StoreRead(BaseModel):
    id: int
    owner_id: int
    name: str
    address: str
    city: str
    latitude: float
    longitude: float
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductCreate(BaseModel):
    name: str
    sku: str
    brand: str | None = None
    vehicle_model: str | None = None
    description: str | None = None
    price: Decimal = Field(gt=0)
    stock: int = Field(ge=0)


class ProductRead(BaseModel):
    id: int
    store_id: int
    name: str
    sku: str
    brand: str | None
    vehicle_model: str | None
    description: str | None
    price: Decimal
    stock: int
    image_url: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductSearchResult(ProductRead):
    store_name: str
    city: str
    distance_score: float


class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)


class OrderCreate(BaseModel):
    store_id: int
    delivery_address: str
    delivery_latitude: float | None = None
    delivery_longitude: float | None = None
    notes: str | None = None
    items: list[OrderItemCreate]


class OrderItemRead(BaseModel):
    id: int
    product_id: int
    quantity: int
    unit_price: Decimal
    product_name: str


class OrderRead(BaseModel):
    id: int
    customer_id: int
    store_id: int
    delivery_person_id: int | None
    status: OrderStatus
    delivery_address: str
    delivery_latitude: float | None
    delivery_longitude: float | None
    notes: str | None
    total_amount: Decimal
    created_at: datetime
    items: list[OrderItemRead]


class DeliveryAssign(BaseModel):
    order_id: int


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
