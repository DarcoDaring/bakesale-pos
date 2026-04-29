import api from '../services/api';

// ── Sale Item Master ──────────────────────────────────────────────────────────
export const getKCSaleItems          = ()      => api.get('/kc-sale-items/');
export const getKCSaleItemsWithStock = ()      => api.get('/kc-sale-items/with_stock/');
export const createKCSaleItem        = d       => api.post('/kc-sale-items/', d);
export const updateKCSaleItem        = (id, d) => api.patch(`/kc-sale-items/${id}/`, d);
export const deleteKCSaleItem        = id      => api.delete(`/kc-sale-items/${id}/`);

// ── KC Bills ──────────────────────────────────────────────────────────────────
export const createKCBill            = d       => api.post('/kc-bills/', d);
export const getKCBills              = params  => api.get('/kc-bills/', { params });
export const getKCBill               = id      => api.get(`/kc-bills/${id}/`);
export const deleteKCBill            = id      => api.delete(`/kc-bills/${id}/`);

// ── KC Purchase ───────────────────────────────────────────────────────────────
export const createKCPurchase        = d       => api.post('/kc-purchases/', d);
export const getKCPurchases          = params  => api.get('/kc-purchases/', { params });
export const getKCPurchasesToday     = ()      => api.get('/kc-purchases/today/');
export const deleteKCPurchase        = id      => api.delete(`/kc-purchases/${id}/`);

// ── KC Stock (Balance) ────────────────────────────────────────────────────────
export const createKCStock           = d       => api.post('/kc-stock/', d);
export const getKCStock              = params  => api.get('/kc-stock/', { params });
export const getKCStockToday         = ()      => api.get('/kc-stock/today/');

// ── KC Store Issue ────────────────────────────────────────────────────────────
export const getKCStoreItems         = ()      => api.get('/kc-store-items/');
export const createKCStoreItem       = d       => api.post('/kc-store-items/', d);
export const updateKCStoreItem       = (id, d) => api.patch(`/kc-store-items/${id}/`, d);
export const createKCIssue           = d       => api.post('/kc-issues/', d);
export const getKCIssues             = params  => api.get('/kc-issues/', { params });
export const deleteKCIssue           = id      => api.delete(`/kc-issues/${id}/`);

// ── KC Closing Stock ──────────────────────────────────────────────────────────
export const getKCClosingStock       = ()      => api.get('/kc-closing-stock/');
export const saveKCClosingStock      = d       => api.post('/kc-closing-stock/', d);

// ── KC Report ─────────────────────────────────────────────────────────────────
export const getKCReport             = params  => api.get('/kc-report/', { params });