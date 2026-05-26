import {
  createStoredStaffUser,
  getStoredStaffUsers,
  updateStoredStaffUser,
} from "../lib/staffUsersStore";
import { createCrudService } from "./createCrudService";

const staffUsersService = createCrudService({
  table: "staff_users",
  local: {
    list: async () => getStoredStaffUsers(),
    getById: (staffUserId) =>
      getStoredStaffUsers().then(
        (staffUsers) => staffUsers.find((staffUser) => staffUser.id === staffUserId) || null
      ),
    create: (staffUser) => createStoredStaffUser(staffUser),
    update: (staffUserId, updates) => updateStoredStaffUser(staffUserId, updates),
  },
});

export default staffUsersService;

export const listStaffUsers = () => staffUsersService.list();
export const getStaffUserById = (staffUserId) => staffUsersService.getById(staffUserId);
export const createStaffUserRecord = (staffUser) => staffUsersService.create(staffUser);
export const updateStaffUserRecord = (staffUserId, updates) =>
  staffUsersService.update(staffUserId, updates);
