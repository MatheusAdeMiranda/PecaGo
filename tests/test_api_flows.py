import os
import unittest
from pathlib import Path


TEST_DB_FILE = Path(__file__).resolve().parents[1] / "test_autoparts_mvp.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE.as_posix()}"
os.environ["SECRET_KEY"] = "test-secret-key"

from fastapi.testclient import TestClient

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import Order, PaymentStatus, Product


class ApiFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client.close()
        engine.dispose()
        if TEST_DB_FILE.exists():
            TEST_DB_FILE.unlink()

    def setUp(self) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

    def seed_demo(self) -> dict:
        response = self.client.post("/demo/seed")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def login_headers(self, email: str, password: str = "123456") -> dict[str, str]:
        response = self.client.post(
            "/auth/login",
            json={"email": email, "password": password},
        )
        self.assertEqual(response.status_code, 200, response.text)
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def create_order(
        self,
        headers: dict[str, str],
        *,
        store_id: int,
        product_id: int,
        quantity: int = 1,
        address: str = "Av. Paulista, 1000",
    ) -> dict:
        response = self.client.post(
            "/orders",
            headers=headers,
            json={
                "store_id": store_id,
                "delivery_address": address,
                "notes": "Pedido criado pelos testes.",
                "items": [{"product_id": product_id, "quantity": quantity}],
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_demo_seed_creates_loginable_accounts_and_updates_stock(self) -> None:
        data = self.seed_demo()

        self.assertEqual(data["demo_users"]["customer"], "customer@demo.com / 123456")

        for email in ("store@demo.com", "customer@demo.com", "delivery@demo.com"):
            headers = self.login_headers(email)
            response = self.client.get("/auth/me", headers=headers)
            self.assertEqual(response.status_code, 200, response.text)

        customer_headers = self.login_headers("customer@demo.com")
        me = self.client.get("/auth/me", headers=customer_headers).json()
        self.assertEqual(me["role"], "customer")

        with SessionLocal() as db:
            first_product = db.get(Product, data["product_ids"][0])
            second_product = db.get(Product, data["product_ids"][1])
            self.assertEqual(first_product.stock, 7)
            self.assertEqual(second_product.stock, 14)

    def test_duplicate_items_cannot_bypass_stock_validation(self) -> None:
        data = self.seed_demo()
        customer_headers = self.login_headers("customer@demo.com")
        product_id = data["product_ids"][0]

        response = self.client.post(
            "/orders",
            headers=customer_headers,
            json={
                "store_id": data["store_id"],
                "delivery_address": "Rua de Teste, 123",
                "items": [
                    {"product_id": product_id, "quantity": 4},
                    {"product_id": product_id, "quantity": 4},
                ],
            },
        )

        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("Insufficient stock", response.json()["detail"])

        with SessionLocal() as db:
            product = db.get(Product, product_id)
            self.assertEqual(product.stock, 7)

    def test_delivery_assignment_requires_ready_unassigned_order(self) -> None:
        data = self.seed_demo()
        customer_headers = self.login_headers("customer@demo.com")
        delivery_headers = self.login_headers("delivery@demo.com")

        order = self.create_order(
            customer_headers,
            store_id=data["store_id"],
            product_id=data["product_ids"][0],
        )

        assign_response = self.client.post(
            "/deliveries/assign",
            headers=delivery_headers,
            json={"order_id": order["id"]},
        )

        self.assertEqual(assign_response.status_code, 400, assign_response.text)
        self.assertIn("not ready for delivery assignment", assign_response.json()["detail"])

    def test_status_flow_blocks_skips_and_hides_assigned_orders(self) -> None:
        data = self.seed_demo()
        customer_headers = self.login_headers("customer@demo.com")
        store_headers = self.login_headers("store@demo.com")
        delivery_headers = self.login_headers("delivery@demo.com")

        order = self.create_order(
            customer_headers,
            store_id=data["store_id"],
            product_id=data["product_ids"][1],
        )
        order_id = order["id"]

        # Simula aprovação de pagamento (normalmente feito via webhook do MP)
        with SessionLocal() as db:
            db_order = db.get(Order, order_id)
            db_order.payment_status = PaymentStatus.approved
            db.commit()

        skip_response = self.client.patch(
            f"/orders/{order_id}/status",
            headers=store_headers,
            json={"status": "delivered"},
        )
        self.assertEqual(skip_response.status_code, 400, skip_response.text)
        self.assertIn("Invalid status transition", skip_response.json()["detail"])

        accepted_response = self.client.patch(
            f"/orders/{order_id}/status",
            headers=store_headers,
            json={"status": "accepted"},
        )
        self.assertEqual(accepted_response.status_code, 200, accepted_response.text)
        self.assertEqual(accepted_response.json()["status"], "accepted")

        preparing_response = self.client.patch(
            f"/orders/{order_id}/status",
            headers=store_headers,
            json={"status": "preparing"},
        )
        self.assertEqual(preparing_response.status_code, 200, preparing_response.text)
        self.assertEqual(preparing_response.json()["status"], "preparing")

        available_before_assign = self.client.get("/deliveries/available", headers=delivery_headers)
        self.assertEqual(available_before_assign.status_code, 200, available_before_assign.text)
        self.assertIn(order_id, {item["id"] for item in available_before_assign.json()})

        assigned_response = self.client.post(
            "/deliveries/assign",
            headers=delivery_headers,
            json={"order_id": order_id},
        )
        self.assertEqual(assigned_response.status_code, 200, assigned_response.text)
        self.assertEqual(assigned_response.json()["status"], "in_delivery")

        available_after_assign = self.client.get("/deliveries/available", headers=delivery_headers)
        self.assertEqual(available_after_assign.status_code, 200, available_after_assign.text)
        self.assertNotIn(order_id, {item["id"] for item in available_after_assign.json()})

        store_cancel_response = self.client.patch(
            f"/orders/{order_id}/status",
            headers=store_headers,
            json={"status": "cancelled"},
        )
        self.assertEqual(store_cancel_response.status_code, 400, store_cancel_response.text)
        self.assertIn("Invalid status transition", store_cancel_response.json()["detail"])

        delivered_response = self.client.patch(
            f"/orders/{order_id}/status",
            headers=delivery_headers,
            json={"status": "delivered"},
        )
        self.assertEqual(delivered_response.status_code, 200, delivered_response.text)
        self.assertEqual(delivered_response.json()["status"], "delivered")


if __name__ == "__main__":
    unittest.main()
