import React from 'react';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import NewOrder from './NewOrder';
const mocks = vi.hoisted(() => ({ save: vi.fn(async (order) => ({ ...order, order_number: 'TEST-1' })) }));
vi.mock('../lib/productsStore', async (importOriginal) => ({ ...(await importOriginal()), useStoredProducts: () => [
  { id: 'shirt', name: 'T-shirt', colors: ['Black', 'Red'], sizes: ['M', 'L'], base_garment_price: 10, status: 'Active' },
  { id: 'hoodie', name: 'Hoodie', colors: ['Blue'], sizes: ['XL'], base_garment_price: 25, status: 'Active' },
] }));
vi.mock('../lib/customersStore', () => ({ getStoredCustomers: () => [], createStoredCustomer: async () => ({ id: 'customer' }), linkOrderToCustomer: async () => {} }));
vi.mock('../lib/ordersStore', () => ({ createStoredOrder: mocks.save }));
vi.mock('../services/customerArtworkService', () => ({ uploadCustomerArtwork: vi.fn() }));
afterEach(() => { cleanup(); mocks.save.mockClear(); });
function select(id, qty, size) {
 fireEvent.change(screen.getByTestId('new-order-product-select'), { target: { value: id } });
 fireEvent.change(screen.getAllByTestId('new-order-size-input').find((input) => input.getAttribute('data-size-key') === size), { target: { value: qty } });
}
test('saves different colours and products in one staff order, including the current item', async () => {
 render(<MemoryRouter><NewOrder /></MemoryRouter>);
 fireEvent.change(screen.getByTestId('new-order-customer-name-input'), { target: { value: 'Test Customer' } });
 fireEvent.change(screen.getByTestId('new-order-customer-phone-input'), { target: { value: '5195551234' } });
 select('shirt', '3', 'L');
 fireEvent.click(screen.getByText('Add Another Item'));
 select('shirt', '2', 'M');
 fireEvent.change(screen.getByLabelText('Garment Color'), { target: { value: 'Red' } });
 fireEvent.click(screen.getByText('Add Another Item'));
 select('hoodie', '1', 'XL');
 fireEvent.click(screen.getByTestId('new-order-no-deposit-radio'));
 fireEvent.click(screen.getByTestId('new-order-save-button'));
 await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
 const order = mocks.save.mock.calls[0][0];
 expect(order.qty).toBe(6);
 expect(order.line_items.map((item) => item.selected_color)).toEqual(['Black', 'Red', 'Blue']);
 expect(order.line_items.map((item) => item.size_breakdown)).toEqual([{ M: 0, L: 3 }, { M: 2, L: 0 }, { XL: 1 }]);
 expect(order.quote.quantity).toBe(6);
 expect(order.quote.total).toBe(84.75); 
});
test('rejects fractional quantities and allows removal of added items', () => {
 render(<MemoryRouter><NewOrder /></MemoryRouter>);
 select('shirt', '1.5', 'L');
 fireEvent.click(screen.getByText('Add Another Item'));
 expect(screen.queryByLabelText('Remove item 1')).toBeNull();
 select('shirt', '3', 'L');
 fireEvent.click(screen.getByText('Add Another Item'));
 fireEvent.click(screen.getByLabelText('Remove item 1'));
 expect(screen.queryByLabelText('Remove item 1')).toBeNull();
});
