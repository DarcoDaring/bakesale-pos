from rest_framework import generics
from .models import Purchase, Supplier
from .serializers import PurchaseSerializer
from rest_framework.response import Response

class PurchaseCreateView(generics.CreateAPIView):
    queryset = Purchase.objects.all()
    serializer_class = PurchaseSerializer


class SupplierListView(generics.ListAPIView):
    queryset = Supplier.objects.all()
    serializer_class = None

    def list(self, request):
        suppliers = Supplier.objects.all().values()
        return Response(suppliers)
    

class SupplierCreateView(generics.CreateAPIView):
    queryset = Supplier.objects.all()

    def create(self, request, *args, **kwargs):
        supplier = Supplier.objects.create(
            name=request.data.get('name'),
            phone=request.data.get('phone', ''),
            address=request.data.get('address', '')
        )
        return Response({
            "id": supplier.id,
            "name": supplier.name,
            "phone": supplier.phone,
            "address": supplier.address
        })