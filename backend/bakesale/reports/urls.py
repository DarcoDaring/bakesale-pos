from django.urls import path
from .views import (
    DailySalesView,
    DateRangeSalesView,
    ItemWiseSalesView,
    SalesReportView   # ✅ ADD THIS
)

urlpatterns = [
    path('', SalesReportView.as_view()),   # ✅ MAIN SALES REPORT
    path('daily/', DailySalesView.as_view()),
    path('range/', DateRangeSalesView.as_view()),
    path('items/', ItemWiseSalesView.as_view()),
]