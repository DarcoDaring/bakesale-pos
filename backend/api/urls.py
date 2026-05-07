from django.urls import path, include
 
from .kc_views import (
    KCSaleItemViewSet, KCBillViewSet, KCPurchaseViewSet,
    KCStockViewSet, KCStoreItemViewSet, KCStoreIssueViewSet, KCReportView, KCClosingStockViewSet
)
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'users',             views.UserViewSet)
router.register(r'vendors',           views.VendorViewSet)
router.register(r'products',          views.ProductViewSet)
router.register(r'purchases',         views.PurchaseBillViewSet)
router.register(r'bills',             views.SaleBillViewSet)
router.register(r'returns',           views.ReturnItemViewSet)
router.register(r'internal-masters',  views.InternalSaleMasterViewSet)
router.register(r'internal-sales',    views.InternalSaleViewSet)
router.register(r'purchase-returns',  views.PurchaseReturnViewSet)
router.register(r'direct-masters',    views.DirectSaleMasterViewSet)
router.register(r'direct-sales',      views.DirectSaleViewSet)
router.register(r'stock-adjustments', views.StockAdjustmentRequestViewSet)
router.register(r'stock-transfers',   views.StockTransferViewSet)
router.register(r'permissions',       views.UserPermissionViewSet, basename='permissions')
router.register(r'item-returns',       views.ItemReturnViewSet)
router.register(r'physical-stock-requests', views.PhysicalStockRequestViewSet, basename='physical-stock')
router.register(r'internal-sale-bills', views.InternalSaleBillViewSet)
router.register(r'kc-sale-items',  KCSaleItemViewSet,  basename='kc-sale-items')
router.register(r'kc-bills',       KCBillViewSet,       basename='kc-bills')
router.register(r'kc-purchases',   KCPurchaseViewSet,   basename='kc-purchases')
router.register(r'kc-stock',       KCStockViewSet,      basename='kc-stock')
router.register(r'kc-store-items', KCStoreItemViewSet,  basename='kc-store-items')
router.register(r'kc-issues',      KCStoreIssueViewSet, basename='kc-issues')
router.register(r'kc-report',      KCReportView,        basename='kc-report')
router.register(r'kc-closing-stock', KCClosingStockViewSet, basename='kc-closing-stock')
urlpatterns = [
    path('', include(router.urls)),
    path('backup/',       views.BackupView.as_view(),       name='backup'),
    path('profit-loss/',  views.ProfitLossView.as_view(),   name='profit-loss'),
]