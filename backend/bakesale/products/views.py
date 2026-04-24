from rest_framework import generics
from .models import Product
from .serializers import ProductSerializer
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response

# 🔍 Search Product (Autocomplete)
class ProductSearchView(generics.ListAPIView):
    serializer_class = ProductSerializer

    def get_queryset(self):
        query = self.request.GET.get('q', '')

        return Product.objects.filter(
            Q(name__icontains=query) |
            Q(barcode__icontains=query)
        )


# ➕ Create Product (Popup)
class ProductCreateView(generics.CreateAPIView):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer

    def perform_create(self, serializer):
        barcode = self.request.data.get('barcode')

        if not barcode:  # 🔥 handle empty or null
            last = Product.objects.order_by('-id').first()
            new_id = last.id + 1 if last else 1
            barcode = f"PRD{str(new_id).zfill(3)}"

        serializer.save(barcode=barcode)



class GenerateBarcodeView(APIView):
    def get(self, request):
        last = Product.objects.order_by('-id').first()
        new_id = last.id + 1 if last else 1

        barcode = f"PRD{str(new_id).zfill(6)}"

        return Response({"barcode": barcode})