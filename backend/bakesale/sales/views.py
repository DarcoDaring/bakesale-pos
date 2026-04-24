from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Sum
from .models import Sale, SaleItem
from .serializers import SaleSerializer
from rest_framework.generics import RetrieveUpdateDestroyAPIView

# ✅ CREATE SALE
class SaleCreateView(generics.CreateAPIView):
    queryset = Sale.objects.all()
    serializer_class = SaleSerializer


# ✅ DAILY REPORT
class DailySalesReport(APIView):
    def get(self, request):
        sales = Sale.objects.all()

        total_sales = sales.aggregate(total=Sum('total_amount'))['total'] or 0
        bill_count = sales.count()

        cash_total = sales.filter(payment_mode="CASH").aggregate(
            total=Sum('total_amount')
        )['total'] or 0

        upi_total = sales.filter(payment_mode="UPI").aggregate(
            total=Sum('total_amount')
        )['total'] or 0

        card_total = sales.filter(payment_mode="CARD").aggregate(
            total=Sum('total_amount')
        )['total'] or 0

        mixed_cash = sales.filter(payment_mode="MIXED").aggregate(
            total=Sum('cash_amount')
        )['total'] or 0

        mixed_credit = sales.filter(payment_mode="MIXED").aggregate(
            total=Sum('credit_amount')
        )['total'] or 0

        return Response({
            "summary": {
                "total_sales": total_sales,
                "bill_count": bill_count,
                "cash_total": cash_total + mixed_cash,
                "upi_total": upi_total,
                "card_total": card_total,
                "credit_total": mixed_credit
            }
        })


# ✅ SALES REPORT (BILL LIST)
class SalesReport(APIView):
    def get(self, request):
        sales = Sale.objects.all().order_by('-date')

        return Response({
            "sales": list(sales.values())
        })


# ✅ ITEM-WISE REPORT WITH DATE FILTER
class ItemWiseReport(APIView):
    def get(self, request):
        start = request.GET.get('start')
        end = request.GET.get('end')

        items = SaleItem.objects.select_related('sale')

        if start and end:
            items = items.filter(sale__date__range=[start, end])

        data = items.values(
            'product__name'
        ).annotate(
            total_qty=Sum('quantity'),
            total_sales=Sum('total')
        )

        return Response(list(data))
    

class SaleDetailView(RetrieveUpdateDestroyAPIView):
    queryset = Sale.objects.all()
    serializer_class = SaleSerializer