import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CategoryView from "./pages/CategoryView";
import GarmentView from "./pages/GarmentView";
import OrderPreview from "./pages/OrderPreview";
import OrderSubmitted from "./pages/OrderSubmitted";
import MyOrders from "./pages/MyOrders";
import DepositPayment from "./pages/DepositPayment";
import PaymentConfirmed from "./pages/PaymentConfirmed";
import ApprovalReview from "./pages/ApprovalReview";
import QuoteView from "./public/QuoteView";
import Dashboard from "./admin/Dashboard";
import Orders from "./admin/Orders";
import NewOrder from "./admin/NewOrder";
import OrderDetail from "./admin/OrderDetail";
import Products from "./admin/Products";
import Queue from "./admin/Queue";
import Customers from "./admin/Customers";
import CustomerDetail from "./admin/CustomerDetail";
import QuickSale from "./admin/QuickSale";
import Sales from "./admin/Sales";
import SaleReceipt from "./admin/SaleReceipt";
import StaffUsers from "./admin/StaffUsers";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
          <Route path="category/:categoryId" element={<CategoryView />} />
          <Route path="garment/:garmentId" element={<GarmentView />} />
          <Route path="order-preview" element={<OrderPreview />} />
          <Route path="order-submitted" element={<OrderSubmitted />} />
          <Route path="my-orders" element={<MyOrders />} />
          <Route path="deposit-payment" element={<DepositPayment />} />
          <Route path="payment-confirmed" element={<PaymentConfirmed />} />
          <Route path="approval/:orderNumber" element={<ApprovalReview />} />
          <Route path="quote/:orderNumber" element={<QuoteView />} />
          <Route path="admin" element={<Dashboard />} />
          <Route path="admin/orders" element={<Orders />} />
          <Route path="admin/orders/new" element={<NewOrder />} />
          <Route path="admin/sales" element={<Sales />} />
          <Route path="admin/sales/new" element={<QuickSale />} />
          <Route path="admin/sales/receipt/:saleNumber" element={<SaleReceipt />} />
          <Route path="admin/orders/:orderNumber" element={<OrderDetail />} />
          <Route path="admin/products" element={<Products />} />
          <Route path="admin/queue" element={<Queue />} />
          <Route path="admin/customers" element={<Customers />} />
          <Route path="admin/customers/:customerId" element={<CustomerDetail />} />
          <Route path="admin/staff-users" element={<StaffUsers />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
