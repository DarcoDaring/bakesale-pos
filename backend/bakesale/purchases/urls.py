from django.urls import path
from .views import PurchaseCreateView, SupplierCreateView, SupplierListView

urlpatterns = [
    path('create/', PurchaseCreateView.as_view()),
    path('suppliers/', SupplierListView.as_view()),
    path('suppliers/create/', SupplierCreateView.as_view()),
]