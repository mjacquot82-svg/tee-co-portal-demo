import { buildSupabaseOrderPayload, mapSupabaseOrderRowToOrder } from '../../src/lib/ordersRepository';
export const supabase = null;
export const isSupabaseConfigured = false;
export const supabaseConfig = {};
export const supabaseDiagnostics = {};
export const session = { id: 'synthetic-customer', email: 'synthetic@example.test', displayName: 'Synthetic Customer', phone: '5195551234' };
const products = ['shirt', 'hoodie'].map(id => ({ id, name: id === 'shirt' ? 'Test Shirt' : 'Test Hoodie', status: 'Active', colors: ['Black'], sizes: ['M', 'L'], placements: ['Front', 'Back'], production_methods: ['DTF'], base_garment_price: 10 }));
const lookups = {};
export const useStoredProducts = () => products;
export const areStoredProductsReady = () => true;
export const getProductPlacementConfig = (product = {}) => (product?.placements || []).map(label => ({ label, price: 0 }));
export const resolveProductBasePrice = product => Number(product?.base_garment_price || 0);
export const useCatalogLookups = () => lookups;
export const getActiveCustomerSession = () => session;
export const ensureCustomerProfile = async () => ({ ...session });
export const linkOrderToCustomer = async () => {};
export const listCustomerArtwork = async () => [];
export const useCustomerPortalData = () => ({ profile: session });
export const formatCurrency = value => `$${Number(value || 0).toFixed(2)}`;
export async function uploadCustomerArtwork(_id, file) {
  window.__artworkTest.uploads.push(file.name);
  return { id: 'synthetic-logo', file_name: file.name, storage_path: 'synthetic/logo.svg' };
}
export async function createStoredOrder(input) {
  const payload = buildSupabaseOrderPayload({ ...input, order_number: 'SYNTHETIC-BROWSER' });
  const restored = mapSupabaseOrderRowToOrder(JSON.parse(JSON.stringify(payload)));
  window.__artworkTest.submissions.push(restored);
  sessionStorage.setItem('syntheticSubmittedOrder', JSON.stringify(restored));
  return restored;
}
export const getStoredCustomers = () => [];
export const getStoredOrders = () => [];
export const findStoredCustomer = () => null;
export const getStoredProduct = id => products.find(product => product.id === id);
export const getStoredProducts = () => products;
export const supabaseInitializationError = null;
