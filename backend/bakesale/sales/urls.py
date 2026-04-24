from django.urls import path
from .views import (
    SaleCreateView,
    DailySalesReport,
    SalesReport,
    ItemWiseReport,
    SaleDetailView
)

urlpatterns = [
    path('', SalesReport.as_view()),                 # ✅ GET ALL SALES
    path('<int:pk>/', SaleDetailView.as_view()),     # ✅ GET / UPDATE / DELETE

    path('create/', SaleCreateView.as_view()),       # ✅ CREATE
    path('daily/', DailySalesReport.as_view()),      # ✅ DAILY REPORT
    path('items/', ItemWiseReport.as_view()),        # ✅ ITEM REPORT
]