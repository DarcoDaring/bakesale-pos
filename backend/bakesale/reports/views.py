from rest_framework.views import APIView
from rest_framework.response import Response
from sales.models import SaleItem, Sale
from django.db.models import Sum
from datetime import date


# 📅 DAILY SALES (WITH OPTIONAL DATE FILTER)
class DailySalesView(APIView):
    def get(self, request):
        today = date.today()

        sales = Sale.objects.filter(date__range=[today, today])

        total = sales.aggregate(total=Sum('total_amount'))['total'] or 0

        return Response({
            "total_sales": total,
            "bill_count": sales.count()
        })


# 📄 SALES REPORT (FULL LIST + FILTER)
class SalesReportView(APIView):
    def get(self, request):
        start = request.GET.get('start')
        end = request.GET.get('end')

        sales = Sale.objects.all().order_by('-date')

        # ✅ Apply filter
        if start and end:
            sales = sales.filter(date__range=[start, end])

        data = list(sales.values())

        return Response({
            "sales": data
        })


# 📦 ITEM-WISE SALES (WITH FILTER)
class ItemWiseSalesView(APIView):
    def get(self, request):
        start = request.GET.get('start')
        end = request.GET.get('end')

        items = SaleItem.objects.select_related('sale')

        # ✅ Apply filter
        if start and end:
            items = items.filter(sale__date__range=[start, end])

        data = (
            items
            .values('product__name')
            .annotate(
                total_qty=Sum('quantity'),
                total_sales=Sum('total')
            )
        )

        return Response(list(data))