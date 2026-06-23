import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import CustomerPortalShell from "./customer-portal/CustomerPortalShell";
import CustomerPortalOrders from "./customer-portal/CustomerPortalOrders";
import CustomerPortalQuotes from "./customer-portal/CustomerPortalQuotes";
import CustomerPortalInvoices from "./customer-portal/CustomerPortalInvoices";
import CustomerPortalAccount from "./customer-portal/CustomerPortalAccount";
import CustomerPortalRequestOrder from "./customer-portal/CustomerPortalRequestOrder";
import CustomerPortalDeposit from "./customer-portal/CustomerPortalDeposit";
import CustomerPortalArtwork from "./customer-portal/CustomerPortalArtwork";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import CategoryView from "./pages/CategoryView";
import GarmentView from "./pages/GarmentView";
import OrderPreview from "./pages/OrderPreview";
import OrderSubmitted from "./pages/OrderSubmitted";
import DepositPayment from "./pages/DepositPayment";
import PaymentConfirmed from "./pages/PaymentConfirmed";
import ApprovalReview from "./pages/ApprovalReview";
import QuoteView from "./public/QuoteView";
import Dashboard from "./admin/Dashboard";
import Orders from "./admin/Orders";
import NewOrder from "./admin/NewOrder";
import OrderDetail from "./admin/OrderDetail";
import Products from "./admin/Products";
import GarmentLibrary from "./admin/GarmentLibrary";
import Assignments from "./admin/Assignments";
import Customers from "./admin/Customers";
import CustomerDetail from "./admin/CustomerDetail";
import QuickSale from "./admin/QuickSale";
import Sales from "./admin/Sales";
import SaleReceipt from "./admin/SaleReceipt";
import StaffUsers from "./admin/StaffUsers";
import Quotes from "./admin/Quotes";
import ArchivedQuotes from "./admin/ArchivedQuotes";
import CanceledOrders from "./admin/CanceledOrders";
import QuoteDetail from "./admin/QuoteDetail";
import InvoicesPayments from "./admin/InvoicesPayments";
import FinancialHistory from "./admin/FinancialHistory";
import NotificationTemplates from "./admin/NotificationTemplates";
import AppSplash from "./components/AppSplash";

export default function App() {
  return (
    <BrowserRouter>
      <AppSplash>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="login" element={<Login />} />
            <Route path="signup" element={<Signup />} />
            <Route path="category/:categoryId" element={<CategoryView />} />
            <Route path="garment/:garmentId" element={<GarmentView />} />
            <Route path="order-preview" element={<OrderPreview />} />
            <Route path="order-submitted" element={<OrderSubmitted />} />
            <Route path="my-orders" element={<Navigate to="/portal/orders" replace />} />
            <Route path="deposit-payment" element={<DepositPayment />} />
            <Route path="payment-confirmed" element={<PaymentConfirmed />} />
            <Route path="approval/:orderNumber" element={<ApprovalReview />} />
            <Route path="quote/:orderNumber" element={<QuoteView />} />

            <Route path="admin" element={<Dashboard />} />
            <Route path="admin/quotes" element={<Quotes />} />
            <Route path="admin/quotes/new" element={<NewOrder />} />
            <Route path="admin/quotes/archived" element={<ArchivedQuotes />} />
            <Route path="admin/records/canceled" element={<CanceledOrders />} />
            <Route path="admin/quotes/:orderNumber" element={<QuoteDetail />} />
            <Route path="admin/orders" element={<Orders />} />
            <Route path="admin/orders/new" element={<Navigate to="/admin/quotes/new" replace />} />
            <Route path="admin/orders/:orderNumber" element={<OrderDetail />} />

            <Route path="admin/products" element={<Products />} />
            <Route path="admin/garments" element={<GarmentLibrary />} />
            <Route path="admin/assignments" element={<Assignments />} />
            <Route path="admin/financial" element={<InvoicesPayments />} />
            <Route path="admin/financial/history" element={<FinancialHistory />} />

            <Route path="admin/customers" element={<Customers />} />
            <Route
              path="admin/customers/:customerId"
              element={<CustomerDetail />}
            />

            <Route path="admin/sales" element={<Sales />} />
            <Route path="admin/sales/new" element={<QuickSale />} />
            <Route
              path="admin/sales/receipt/:saleNumber"
              element={<SaleReceipt />}
            />

            <Route
              path="admin/staff-users"
              element={<StaffUsers />}
            />

            <Route
              path="admin/settings/notifications"
              element={<NotificationTemplates />}
            />
          </Route>

          <Route path="/portal" element={<CustomerPortalShell />}>
            <Route index element={<Navigate to="orders" replace />} />
            <Route path="request-order" element={<CustomerPortalRequestOrder />} />
            <Route path="orders" element={<CustomerPortalOrders />} />
            <Route path="orders/:orderNumber/deposit" element={<CustomerPortalDeposit />} />
            <Route path="orders/:orderNumber/artwork" element={<CustomerPortalArtwork />} />
            <Route path="quotes" element={<CustomerPortalQuotes />} />
            <Route path="invoices" element={<CustomerPortalInvoices />} />
            <Route path="account" element={<CustomerPortalAccount />} />
          </Route>
        </Routes>
      </AppSplash>
    </BrowserRouter>
  );
}
