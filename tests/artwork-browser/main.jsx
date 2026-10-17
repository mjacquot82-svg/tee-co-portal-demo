import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Outlet, useNavigate } from 'react-router-dom';
import OrderPreview from '../../src/pages/OrderPreview';
import RequestOrder from '../../src/customer-portal/CustomerPortalRequestOrder';
import GarmentProductionCards from '../../src/order-detail/GarmentProductionCards';
import { buildProductionReadiness } from '../../src/quotes/productionReadiness';
import { isArtworkApprovalSatisfied } from '../../src/orders/workflowGating';
import { savePendingCustomerRequest } from '../../src/lib/pendingCustomerRequestStore';
import { session } from './services';
import '../../src/index.css';
window.__artworkTest = { submissions: [], uploads: [] };
const line = (id, extra = {}) => ({ id, productId: id === 'b' ? 'hoodie' : 'shirt', garmentName: id === 'b' ? 'Test Hoodie' : 'Test Shirt', decorationType: 'DTF', size_breakdown: { M: 2 }, placement: 'Front', ...extra });
function FixtureStart() {
 const navigate = useNavigate();
 function start() { sessionStorage.clear(); savePendingCustomerRequest({ productId: 'shirt', lineItems: [line('a'), line('b')] }); navigate('/portal/request-order', { state: { pendingRequestSource: 'public-garment-flow' } }); }
 return <><h1>Synthetic artwork browser fixture</h1><button onClick={start}>Start two garments</button><button onClick={() => navigate('/portal/order/order-preview', { state: { productId: 'shirt', garmentName: 'Test Shirt', selectedSize: 'M', quantity: 2 } })}>Configure garment</button></>;
}
function StaffResult() {
 const order = JSON.parse(sessionStorage.getItem('syntheticSubmittedOrder') || '{}');
 return <><h1>Synthetic submission received</h1><p>Artwork approval: {order.artwork_approval_status}</p><p>Production enabled: {String(order.production_ready === true || buildProductionReadiness(order, {}).ready || isArtworkApprovalSatisfied(order))}</p><GarmentProductionCards order={order} /></>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path="/" element={<FixtureStart />} /><Route path="/portal/order/order-preview" element={<OrderPreview />} /><Route element={<Outlet context={{ customerSession: session }} />}><Route path="/portal/request-order" element={<RequestOrder />} /></Route><Route path="/portal/order-submitted" element={<StaffResult />} /></Routes></BrowserRouter>);
requestAnimationFrame(() => document.body.classList.add('app-ready'));
import '../../src/admin/OrderDetail.css';
