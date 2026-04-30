/**
 * api.js — Bakesale API service
 *
 * In Electron: reads server IP from saved config (allows LAN connection)
 * In browser (dev): uses REACT_APP_API_URL from .env
 *
 * FIX (cache-busting):
 *   searchProducts and getProductByBarcode now accept an optional `extra`
 *   params object. Sale.js passes `{ _t: Date.now() }` via the freshSearch /
 *   freshBarcode wrappers, which makes each URL unique and prevents the browser
 *   from serving a stale cached response where stock_quantity was still 0.
 */
import axios from 'axios';

// ─── Determine API base URL ───────────────────────────────────────────────────
function getAPIBase() {
  // Check if running inside Electron
  if (window.electronAPI?.isElectron) {
    // Try to load saved server config from Electron store
    // This is set during first-time setup (server vs client mode)
    const savedConfig = window.__bakesaleServerConfig;
    if (savedConfig?.serverIP) {
      return `http://${savedConfig.serverIP}:${savedConfig.serverPort || 8000}/api`;
    }
    // Default: this machine is the server
    return 'http://127.0.0.1:8000/api';
  }
  // Browser/dev mode
  return process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
}

// Load server config — blocking promise so login waits for correct IP
let configReady = Promise.resolve();

if (window.electronAPI?.isElectron) {
  configReady = window.electronAPI.loadServerConfig()
    .then(config => {
      if (config) {
        window.__bakesaleServerConfig = config;
      }
    })
    .catch(e => console.warn('Could not load server config:', e));
}

const API_BASE = getAPIBase();

const api = axios.create({ baseURL: API_BASE });

// Update baseURL after config loads
configReady.then(() => {
  const newBase = getAPIBase();
  api.defaults.baseURL = newBase;
});

// Export so login can wait for config before firing
export const waitForConfig = () => configReady;

// ─── Auth interceptor ─────────────────────────────────────────────────────────
api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          const { data } = await axios.post(`${api.defaults.baseURL}/token/refresh/`, { refresh });
          localStorage.setItem('access_token', data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);

// ─── Exports ──────────────────────────────────────────────────────────────────
export const login = async (u, p) => {
  await configReady;
  const base = getAPIBase();
  api.defaults.baseURL = base;
  return axios.post(`${base}/token/`, { username: u, password: p });
};

export const getVendors   = ()      => api.get('/vendors/');
export const createVendor = d       => api.post('/vendors/', d);
export const updateVendor = (id, d) => api.patch(`/vendors/${id}/`, d);
export const deleteVendor = id      => api.delete(`/vendors/${id}/`);

// ─── FIX: accept optional `extra` params so Sale.js can pass { _t: Date.now() }
//     This makes each search URL unique → browser never serves a stale cache.
export const searchProducts      = (q, extra = {})  => api.get('/products/search/',     { params: { q, ...extra } });
export const getProductByBarcode = (bc, extra = {}) => api.get('/products/by_barcode/', { params: { barcode: bc, ...extra } });

export const createProduct       = d       => api.post('/products/', d);
export const updateProduct       = (id, d) => api.patch(`/products/${id}/`, d);
export const getProducts         = ()      => api.get('/products/');
export const getStockStatus      = ()      => api.get('/products/stock_status/');

export const createPurchaseBill   = d      => api.post('/purchases/', d);
export const getPurchases         = ()     => api.get('/purchases/');
export const getPurchaseBill      = id     => api.get(`/purchases/${id}/`);
export const getPurchaseReport    = params => api.get('/purchases/report/', { params });
export const getPurchaseTaxReport = params => api.get('/purchases/purchase_tax_report/', { params });

export const createBill        = d       => api.post('/bills/', d);
export const getBills          = ()      => api.get('/bills/');
export const getBill           = id      => api.get(`/bills/${id}/`);
export const getSaleReport     = params  => api.get('/bills/sale_report/',      { params });
export const getItemWiseReport = params  => api.get('/bills/item_wise_report/', { params });
export const getSalesTaxReport = params  => api.get('/bills/sales_tax_report/', { params });
export const editBillPayment   = (id, d) => api.patch(`/bills/${id}/edit_payment/`, d);
export const deleteBill        = id      => api.delete(`/bills/${id}/`);

export const createReturn = d => api.post('/returns/', d);

export const createPurchaseReturn    = d  => api.post('/purchase-returns/', d);
export const getPurchaseReturnReport = p  => api.get('/purchase-returns/report/', { params: p });
export const markPurchaseReturned    = id => api.patch(`/purchase-returns/${id}/mark_returned/`, {});

export const getInternalMasters   = ()      => api.get('/internal-masters/');
export const createInternalMaster = d       => api.post('/internal-masters/', d);
export const updateInternalMaster = (id, d) => api.patch(`/internal-masters/${id}/`, d);
export const deleteInternalMaster = id      => api.delete(`/internal-masters/${id}/`);

export const createInternalSale    = d => api.post('/internal-sales/', d);
export const getInternalSaleReport = p => api.get('/internal-sales/report/', { params: p });

export const getDirectMasters   = ()      => api.get('/direct-masters/');
export const createDirectMaster = d       => api.post('/direct-masters/', d);
export const updateDirectMaster = (id, d) => api.patch(`/direct-masters/${id}/`, d);

export const createDirectSale    = d      => api.post('/direct-sales/', d);
export const getDirectSaleReport = params => api.get('/direct-sales/report/', { params });

export const createStockAdjustment  = d  => api.post('/stock-adjustments/', d);
export const getStockAdjustments    = () => api.get('/stock-adjustments/');
export const approveStockAdjustment = id => api.patch(`/stock-adjustments/${id}/approve/`, {});
export const rejectStockAdjustment  = id => api.patch(`/stock-adjustments/${id}/reject/`, {});

export const createOpeningStock = d => api.post('/stock-transfers/', d);

export const getUsers   = ()      => api.get('/users/');
export const createUser = d       => api.post('/users/', d);
export const updateUser = (id, d) => api.patch(`/users/${id}/`, d);
export const deleteUser = id      => api.delete(`/users/${id}/`);
export const getMe      = ()      => api.get('/users/me/');

export const getMyPermissions      = ()              => api.get('/permissions/me/');
export const getAllUserPermissions  = ()              => api.get('/permissions/');
export const updateUserPermissions = (userId, data) => api.patch(`/permissions/update/${userId}/`, data);
export const markPurchasePaid      = id              => api.patch(`/purchases/${id}/mark_paid/`);

export const downloadBackup = () => api.get('/backup/', { responseType: 'blob' });
export const uploadBackup   = formData => api.post('/backup/', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});

// ── Item Returns ──────────────────────────────────────────────────────────────
export const createItemReturn    = d      => api.post('/item-returns/', d);
export const getItemReturnReport = params => api.get('/item-returns/report/', { params });
export const getBillsWithProduct = params => api.get('/item-returns/bills_with_product/', { params });

// ── Internal Sale Bills (multi-item) ─────────────────────────────────────────
export const createInternalSaleBill    = d      => api.post('/internal-sale-bills/', d);
export const getInternalSaleBillReport = params => api.get('/internal-sale-bills/report/', { params });

export default api;

// ── Physical Stock Requests ───────────────────────────────────────────────────
export const createPhysicalStockRequest  = d  => api.post('/physical-stock-requests/', d);
export const getPhysicalStockRequests    = () => api.get('/physical-stock-requests/');
export const approvePhysicalStockRequest = id => api.patch(`/physical-stock-requests/${id}/approve/`, {});
export const rejectPhysicalStockRequest  = id => api.patch(`/physical-stock-requests/${id}/reject/`, {});

export const syncStock = () => api.post('/sync-stock/', { confirm: 'SYNC_CONFIRMED' });