import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedCustomerRequest, requireCustomerRequest } from './requestBoundary.js';
const endpoint = 'http://127.0.0.1:4191/rest/v1/customers';
test('customer mock accepts only exact loopback endpoint and expected methods', () => {
 assert.equal(isAllowedCustomerRequest(endpoint + '?select=*', 'GET', ['GET']), true);
 assert.equal(isAllowedCustomerRequest(endpoint, 'POST', ['GET', 'POST']), true);
 for (const url of ['https://example.invalid/rest/v1/customers', endpoint + '_archive', endpoint + '/extra', endpoint.replace('4191','4192')]) assert.equal(isAllowedCustomerRequest(url, 'GET', ['GET']), false);
 for (const method of ['PATCH', 'DELETE', 'PUT', 'OPTIONS', 'POST']) assert.equal(isAllowedCustomerRequest(endpoint, method, ['GET']), false);
});
test('unexpected customer method aborts before returning a synthetic success', async () => {
 let aborted = false;
 const route = { request: () => ({ url: () => endpoint, method: () => 'DELETE' }), abort: async () => { aborted = true; } };
 await assert.rejects(requireCustomerRequest(route, ['GET','POST']), /Unexpected customer request/);
 assert.equal(aborted, true);
});
