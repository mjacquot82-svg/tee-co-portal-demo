export function isCustomerEndpoint(value) {
  const url = new URL(value);
  return url.origin === 'http://127.0.0.1:4191' && url.pathname === '/rest/v1/customers';
}

export function isAllowedCustomerRequest(value, method, allowedMethods) {
  return isCustomerEndpoint(value) && allowedMethods.includes(method);
}

export async function requireCustomerRequest(route, allowedMethods) {
  const request = route.request();
  if (!isAllowedCustomerRequest(request.url(), request.method(), allowedMethods)) {
    await route.abort();
    throw new Error(`Unexpected customer request: ${request.method()} ${request.url()}`);
  }
}
