import React from 'react';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import NewOrder from './NewOrder';
import { buildSupabaseOrderPayload, mapSupabaseOrderRowToOrder } from '../lib/ordersRepository';
const mocks = vi.hoisted(() => ({ upload: vi.fn(async (_customerId, file, metadata) => ({ id: `asset-${file.name}`, name: file.name, file_name: file.name, file_type: file.type, file_size: file.size, asset_url: `https://example.test/${file.name}`, placement_hint: metadata.placementHint })), save: vi.fn(async (order) => ({ ...order, order_number: 'TEST-1' })) }));
vi.mock('../lib/productsStore', async (importOriginal) => ({ ...(await importOriginal()), useStoredProducts: () => [
  { id: 'shirt', name: 'T-shirt', colors: ['Black', 'Red'], sizes: ['M', 'L'], base_garment_price: 10, placements: ['Front', 'Back'], status: 'Active' },
  { id: 'hoodie', name: 'Hoodie', colors: ['Blue'], sizes: ['XL'], base_garment_price: 25, placements: ['Front', 'Back'], status: 'Active' },
] }));
vi.mock('../lib/customersStore', () => ({ getStoredCustomers: () => [], createStoredCustomer: async () => ({ id: 'customer' }), linkOrderToCustomer: async () => {} }));
vi.mock('../lib/ordersStore', () => ({ createStoredOrder: mocks.save }));
vi.mock('../services/customerArtworkService', () => ({ uploadCustomerArtwork: mocks.upload }));
afterEach(() => { cleanup(); mocks.save.mockClear(); mocks.upload.mockClear(); });
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
 const restored = mapSupabaseOrderRowToOrder(buildSupabaseOrderPayload({ ...order, order_number: 'TEST-1' }));
 expect(restored.line_items.map((item) => item.selected_color)).toEqual(['Black', 'Red', 'Blue']);
 expect(restored.qty).toBe(6); 
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

test('saves an added item with a deposit when the next item is still blank', async () => {
 render(<MemoryRouter><NewOrder /></MemoryRouter>);
 fireEvent.change(screen.getByTestId('new-order-customer-name-input'), { target: { value: 'Test Customer' } });
 fireEvent.change(screen.getByTestId('new-order-customer-phone-input'), { target: { value: '5195551234' } });
 select('shirt', '3', 'L');
 fireEvent.click(screen.getByText('Add Another Item'));
 fireEvent.click(screen.getByTestId('new-order-deposit-required-radio'));
 fireEvent.click(screen.getByTestId('new-order-save-button'));
 await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
 const order = mocks.save.mock.calls[0][0];
 expect(order.line_items).toHaveLength(1);
 expect(order.qty).toBe(3);
 expect(order.deposit_amount).toBe(16.95);
 expect(order.quote.total).toBe(33.9);
});

function identity() {
 fireEvent.change(screen.getByTestId('new-order-customer-name-input'), { target: { value: 'Test Customer' } });
 fireEvent.change(screen.getByTestId('new-order-customer-phone-input'), { target: { value: '5195551234' } });
}
test('keeps separate artwork and placements with each garment', async () => {
 render(<MemoryRouter><NewOrder /></MemoryRouter>);
 identity(); select('shirt', '3', 'L');
 fireEvent.click(screen.getByText('Front', { exact: true }));
 fireEvent.change(screen.getByTestId('new-order-artwork-upload-input'), { target: { files: [new File(['first'], 'shirt.png', { type: 'image/png' })] } });
 await screen.findByText('shirt.png');
 fireEvent.click(screen.getByText('Add Another Item'));
 select('hoodie', '1', 'XL');
 fireEvent.click(screen.getByText('Back', { exact: true }));
 fireEvent.change(screen.getByTestId('new-order-artwork-upload-input'), { target: { files: [new File(['second'], 'hoodie.png', { type: 'image/png' })] } });
 await screen.findByText('hoodie.png');
 fireEvent.click(screen.getByTestId('new-order-no-deposit-radio'));
 fireEvent.click(screen.getByTestId('new-order-save-button'));
 await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
 const order = mocks.save.mock.calls[0][0];
 expect(order.artwork_files.map((file) => file.id).sort()).toEqual(['asset-hoodie.png', 'asset-shirt.png']);
 expect(order.line_items.map((item) => [item.artwork_id, item.placements[0].placement, item.placements[0].artwork_id])).toEqual([
 ['asset-shirt.png', 'Front', 'asset-shirt.png'], ['asset-hoodie.png', 'Back', 'asset-hoodie.png']]);
 expect(mocks.upload.mock.calls.find((call) => call[1].name === 'shirt.png')[2].placementHint).toBe('Front');
 expect(mocks.upload.mock.calls.find((call) => call[1].name === 'hoodie.png')[2].placementHint).toBe('Back');
});
test('does not save an unfinished second item or bypass deposit selection', async () => {
 render(<MemoryRouter><NewOrder /></MemoryRouter>);
 identity(); select('shirt', '3', 'L');
 fireEvent.click(screen.getByText('Add Another Item'));
 select('hoodie', '0', 'XL');
 fireEvent.click(screen.getByTestId('new-order-save-button'));
 expect(mocks.save).not.toHaveBeenCalled();
 expect(screen.getByText('Choose whether this quote requires a deposit before saving.')).toBeTruthy();
 fireEvent.click(screen.getByTestId('new-order-no-deposit-radio'));
 fireEvent.click(screen.getByTestId('new-order-save-button'));
 expect(mocks.save).not.toHaveBeenCalled();
 expect(screen.getByText('Add at least one unit in the size breakdown before saving the quote.')).toBeTruthy();
});
test('removing an item recalculates combined pricing and deposit', async () => {
 render(<MemoryRouter><NewOrder /></MemoryRouter>);
 identity(); select('shirt', '3', 'L');
 fireEvent.click(screen.getByText('Add Another Item'));
 select('hoodie', '1', 'XL');
 fireEvent.click(screen.getByLabelText('Remove item 1'));
 fireEvent.click(screen.getByTestId('new-order-deposit-required-radio'));
 fireEvent.click(screen.getByTestId('new-order-save-button'));
 await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
 const order = mocks.save.mock.calls[0][0];
 expect(order.qty).toBe(1);
 expect(order.line_items).toHaveLength(1);
 expect(order.quote.total).toBe(28.25);
 expect(order.deposit_amount).toBe(14.13);
});
