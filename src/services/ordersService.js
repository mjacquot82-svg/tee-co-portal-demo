import {
  createOrder,
  getOrderByNumber,
  listOrders,
  updateOrder,
} from "../repositories/ordersRepository";
import { createCrudService } from "./createCrudService";

const ordersService = createCrudService({
  table: "orders",
  local: {
    list: () => listOrders(),
    getById: (orderNumber) => getOrderByNumber(orderNumber),
    create: (order) => createOrder(order),
    update: (orderNumber, updates) => updateOrder(orderNumber, updates),
  },
  remoteMatchField: "order_number",
});

export default ordersService;

export const listOrders = () => ordersService.list();
export const getOrderByNumber = (orderNumber) => ordersService.getById(orderNumber);
export const createOrderRecord = (order) => ordersService.create(order);
export const updateOrderRecord = (orderNumber, updates) =>
  ordersService.update(orderNumber, updates);
