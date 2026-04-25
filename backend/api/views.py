from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from django.db.models import Sum, Q
from django.utils import timezone
from decimal import Decimal
import json

from .models import (
    User, Vendor, Product, StockBatch, PurchaseBill, Purchase,
    SaleBill, SaleItem, ReturnItem,
    InternalSaleMaster, InternalSale, InternalSaleBill, PurchaseReturn,
    DirectSaleMaster, DirectSale, StockAdjustmentRequest, StockTransfer, UserPermission,
    ItemReturn, ItemReturnLine, PhysicalStockRequest
)
from .serializers import (
    CustomTokenObtainPairSerializer, UserSerializer, VendorSerializer,
    ProductSerializer, PurchaseBillSerializer, PurchaseBillListSerializer,
    PurchaseItemSerializer,
    SaleBillSerializer, SaleBillListSerializer,
    ReturnItemSerializer, InternalSaleMasterSerializer, InternalSaleSerializer,
    InternalSaleBillSerializer, PurchaseReturnSerializer, DirectSaleMasterSerializer,
    DirectSaleSerializer, StockAdjustmentRequestSerializer, StockTransferSerializer,
    UserPermissionSerializer, ItemReturnSerializer
)
from .permissions import IsAdminUser


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class   = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]


class UserViewSet(viewsets.ModelViewSet):
    queryset           = User.objects.all().order_by('-created_at')
    serializer_class   = UserSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        return Response(UserSerializer(request.user).data)


class VendorViewSet(viewsets.ModelViewSet):
    queryset           = Vendor.objects.all().order_by('name')
    serializer_class   = VendorSerializer
    permission_classes = [IsAuthenticated]


def product_to_batch_rows(products):
    rows = []
    for p in products:
        batches = list(p.batches.filter(quantity__gt=0).order_by('mrp', 'created_at'))
        if not batches:
            # FIX: also sync the product's stock_quantity field if it's out of sync
            if p.stock_quantity != 0:
                Product.objects.filter(pk=p.pk).update(stock_quantity=0)
            rows.append({
                'id': p.id, 'barcode': p.barcode, 'name': p.name,
                'selling_price': str(p.selling_price), 'selling_unit': p.selling_unit,
                'tax': float(p.tax or 0),
                'stock_quantity': '0', 'is_active': p.is_active,
                'batch_id': None, 'batch_mrp': None, 'multi_batch': False
            })
        elif len(batches) == 1:
            b = batches[0]
            # FIX: use actual batch quantity as the truth, not Product.stock_quantity
            rows.append({
                'id': p.id, 'barcode': p.barcode, 'name': p.name,
                'selling_price': str(b.mrp), 'selling_unit': p.selling_unit,
                'tax': float(p.tax or 0),
                'stock_quantity': str(b.quantity),  # <-- batch is the truth
                'is_active': p.is_active,
                'batch_id': b.id, 'batch_mrp': str(b.mrp), 'multi_batch': False
            })
        else:
            for b in batches:
                rows.append({
                    'id': p.id, 'barcode': p.barcode, 'name': p.name,
                    'selling_price': str(b.mrp), 'selling_unit': p.selling_unit,
                    'tax': float(p.tax or 0),
                    'stock_quantity': str(b.quantity),  # <-- batch is the truth
                    'is_active': p.is_active,
                    'batch_id': b.id, 'batch_mrp': str(b.mrp), 'multi_batch': True
                })
    return rows


class ProductViewSet(viewsets.ModelViewSet):
    queryset           = Product.objects.all().order_by('name')
    serializer_class   = ProductSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [filters.SearchFilter]
    search_fields      = ['name', 'barcode']

    @action(detail=False, methods=['get'])
    def search(self, request):
        query = request.query_params.get('q', '')
        if not query: return Response([])
        products = Product.objects.filter(
            Q(name__icontains=query) | Q(barcode__icontains=query), is_active=True
        ).prefetch_related('batches')[:20]
        return Response(product_to_batch_rows(list(products)))

    @action(detail=False, methods=['get'])
    def by_barcode(self, request):
        barcode = request.query_params.get('barcode', '')
        if not barcode: return Response({'error': 'Barcode required'}, status=400)
        try:
            product = Product.objects.prefetch_related('batches').get(barcode=barcode, is_active=True)
            return Response(product_to_batch_rows([product]))
        except Product.DoesNotExist:
            return Response({'error': 'Product not found'}, status=404)

    @action(detail=False, methods=['get'])
    def stock_status(self, request):
        return Response(ProductSerializer(
            Product.objects.filter(is_active=True).order_by('name').prefetch_related('batches'),
            many=True).data)


class PurchaseBillViewSet(viewsets.ModelViewSet):
    queryset           = PurchaseBill.objects.all().order_by('-date')
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list': return PurchaseBillListSerializer
        return PurchaseBillSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['patch'])
    def mark_paid(self, request, pk=None):
        """Mark a purchase bill as paid."""
        bill = self.get_object()
        if bill.is_paid:
            return Response({'detail': 'Already marked as paid'}, status=400)
        bill.is_paid = True
        bill.save()
        return Response(PurchaseBillListSerializer(bill).data)

    @action(detail=False, methods=['get'])
    def report(self, request):
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        bills = PurchaseBill.objects.all().prefetch_related('items', 'vendor')
        if date_from: bills = bills.filter(date__date__gte=date_from)
        if date_to:   bills = bills.filter(date__date__lte=date_to)
        bills = bills.order_by('-date')

        result      = []
        grand_total = 0
        for b in bills:
            bill_taxable = 0
            bill_tax     = 0
            for item in b.items.all():
                qty      = float(item.quantity)
                price    = float(item.purchase_price)
                tax_rate = float(item.tax)
                base     = qty * price
                item_tax = base * tax_rate / 100
                bill_taxable += base
                bill_tax     += item_tax

            bill_total = bill_taxable + bill_tax
            grand_total += bill_total
            result.append({
                'id':                   b.id,
                'purchase_number':      b.purchase_number,
                'vendor_name':          b.vendor.name if b.vendor else '—',
                'is_paid':              b.is_paid,
                'date':                 b.date,
                'total_purchase_price': round(bill_taxable, 2),
                'total_tax':            round(bill_tax, 2),
                'total_value':          round(bill_total, 2),
                'item_count':           b.items.count(),
            })
        return Response({'bills': result, 'grand_total': round(grand_total, 2)})

    @action(detail=False, methods=['get'])
    def purchase_tax_report(self, request):
        """
        Purchase tax report.
        Taxable amount = qty × purchase_price (per item).
        CGST = SGST = tax% / 2 applied on taxable amount.
        """
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        bills = PurchaseBill.objects.all().prefetch_related('items__product', 'vendor')
        if date_from: bills = bills.filter(date__date__gte=date_from)
        if date_to:   bills = bills.filter(date__date__lte=date_to)
        bills = bills.order_by('-date')

        result        = []
        grand_taxable = 0
        grand_cgst    = 0
        grand_sgst    = 0
        grand_tax     = 0
        grand_total   = 0

        for b in bills:
            bill_taxable = 0
            bill_tax     = 0
            for item in b.items.all():
                qty      = float(item.quantity)
                price    = float(item.purchase_price)
                tax_rate = float(item.tax)
                base     = qty * price          # taxable = purchase_price × qty
                item_tax = base * tax_rate / 100
                bill_taxable += base
                bill_tax     += item_tax

            bill_cgst  = bill_tax / 2
            bill_sgst  = bill_tax / 2
            bill_total = bill_taxable + bill_tax

            grand_taxable += bill_taxable
            grand_cgst    += bill_cgst
            grand_sgst    += bill_sgst
            grand_tax     += bill_tax
            grand_total   += bill_total

            result.append({
                'purchase_number': b.purchase_number,
                'vendor_name':     b.vendor.name if b.vendor else '—',
                'date':            b.date,
                'taxable_amount':  round(bill_taxable, 2),
                'cgst':            round(bill_cgst, 2),
                'sgst':            round(bill_sgst, 2),
                'total_tax':       round(bill_tax, 2),
                'total_amount':    round(bill_total, 2),
                'is_paid':         b.is_paid,
            })

        return Response({
            'bills':         result,
            'grand_taxable': round(grand_taxable, 2),
            'grand_cgst':    round(grand_cgst, 2),
            'grand_sgst':    round(grand_sgst, 2),
            'grand_tax':     round(grand_tax, 2),
            'grand_total':   round(grand_total, 2),
        })


class SaleBillViewSet(viewsets.ModelViewSet):
    queryset           = SaleBill.objects.all().order_by('-created_at')
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list': return SaleBillListSerializer
        return SaleBillSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['patch'])
    def edit_payment(self, request, pk=None):
        bill         = self.get_object()
        payment_type = request.data.get('payment_type')
        cash_amount  = float(request.data.get('cash_amount', 0))
        card_amount  = float(request.data.get('card_amount', 0))
        upi_amount   = float(request.data.get('upi_amount',  0))
        if payment_type not in ['cash', 'card', 'upi', 'cash_card', 'cash_upi']:
            return Response({'error': 'Invalid payment type.'}, status=400)
        bill.payment_type = payment_type
        bill.cash_amount  = cash_amount
        bill.card_amount  = card_amount
        bill.upi_amount   = upi_amount
        bill.save()
        return Response(SaleBillListSerializer(bill).data)

    def destroy(self, request, *args, **kwargs):
        from decimal import Decimal
        bill = self.get_object()
        for item in bill.items.all():
            product = item.product
            qty     = Decimal(str(item.quantity))
            if item.batch:
                item.batch.quantity = Decimal(str(item.batch.quantity)) + qty
                item.batch.save()
            else:
                latest = StockBatch.objects.filter(product=product).order_by('-mrp', '-created_at').first()
                if latest:
                    latest.quantity = Decimal(str(latest.quantity)) + qty
                    latest.save()
                else:
                    StockBatch.objects.create(product=product, mrp=product.selling_price, quantity=qty)
            product.stock_quantity = Decimal(str(product.stock_quantity)) + qty
            product.save()
        bill.delete()
        return Response({'message': 'Bill deleted and stock restored'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def sale_report(self, request):
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        if not date_from and not date_to:
            today     = timezone.localdate()
            date_from = str(today)
            date_to   = str(today)
        bills = SaleBill.objects.all()
        if date_from: bills = bills.filter(created_at__date__gte=date_from)
        if date_to:   bills = bills.filter(created_at__date__lte=date_to)
        bills = bills.order_by('-created_at')

        grand_total = bills.aggregate(t=Sum('total_amount'))['t'] or 0
        pure_cash   = bills.filter(payment_type='cash').aggregate(t=Sum('total_amount'))['t'] or 0
        split_cash  = bills.filter(payment_type__in=['cash_card', 'cash_upi']).aggregate(t=Sum('cash_amount'))['t'] or 0
        cash_total  = float(pure_cash) + float(split_cash)
        pure_card   = bills.filter(payment_type='card').aggregate(t=Sum('total_amount'))['t'] or 0
        split_card  = bills.filter(payment_type='cash_card').aggregate(t=Sum('card_amount'))['t'] or 0
        card_total  = float(pure_card) + float(split_card)
        pure_upi    = bills.filter(payment_type='upi').aggregate(t=Sum('total_amount'))['t'] or 0
        split_upi   = bills.filter(payment_type='cash_upi').aggregate(t=Sum('upi_amount'))['t'] or 0
        upi_total   = float(pure_upi) + float(split_upi)

        # Include item return refund totals
        ir_qs = ItemReturn.objects.all()
        if date_from: ir_qs = ir_qs.filter(date__date__gte=date_from)
        if date_to:   ir_qs = ir_qs.filter(date__date__lte=date_to)
        ir_total     = float(ir_qs.aggregate(t=Sum('total_amount'))['t'] or 0)
        ir_cash      = float(ir_qs.filter(payment_type='cash').aggregate(t=Sum('total_amount'))['t'] or 0)
        ir_cash     += float(ir_qs.filter(payment_type__in=['cash_card','cash_upi']).aggregate(t=Sum('cash_amount'))['t'] or 0)
        ir_card      = float(ir_qs.filter(payment_type='card').aggregate(t=Sum('total_amount'))['t'] or 0)
        ir_card     += float(ir_qs.filter(payment_type='cash_card').aggregate(t=Sum('card_amount'))['t'] or 0)
        ir_upi       = float(ir_qs.filter(payment_type='upi').aggregate(t=Sum('total_amount'))['t'] or 0)
        ir_upi      += float(ir_qs.filter(payment_type='cash_upi').aggregate(t=Sum('upi_amount'))['t'] or 0)

        # Direct sale totals for the same period
        ds_qs = DirectSale.objects.all()
        if date_from: ds_qs = ds_qs.filter(date__date__gte=date_from)
        if date_to:   ds_qs = ds_qs.filter(date__date__lte=date_to)
        ds_total = float(ds_qs.aggregate(t=Sum('price'))['t'] or 0)
        ds_cash  = float(ds_qs.filter(payment_type='cash').aggregate(t=Sum('price'))['t'] or 0)
        ds_cash += float(ds_qs.filter(payment_type__in=['cash_card','cash_upi']).aggregate(t=Sum('cash_amount'))['t'] or 0)
        ds_card  = float(ds_qs.filter(payment_type='card').aggregate(t=Sum('price'))['t'] or 0)
        ds_card += float(ds_qs.filter(payment_type='cash_card').aggregate(t=Sum('card_amount'))['t'] or 0)
        ds_upi   = float(ds_qs.filter(payment_type='upi').aggregate(t=Sum('price'))['t'] or 0)
        ds_upi  += float(ds_qs.filter(payment_type='cash_upi').aggregate(t=Sum('upi_amount'))['t'] or 0)
        ds_list  = list(ds_qs.select_related('item').order_by('-date').values(
            'id', 'sale_number', 'item__name', 'price', 'payment_type',
            'cash_amount', 'card_amount', 'upi_amount', 'date'
        ))

        return Response({
            'bills': SaleBillListSerializer(bills, many=True).data,
            'totals': {
                'grand_total':    grand_total,
                'cash_total':     cash_total,
                'card_total':     card_total,
                'upi_total':      upi_total,
            },
            'return_totals': {
                'total':      round(ir_total, 2),
                'cash_total': round(ir_cash, 2),
                'card_total': round(ir_card, 2),
                'upi_total':  round(ir_upi, 2),
            },
            'direct_totals': {
                'total':      round(ds_total, 2),
                'cash_total': round(ds_cash, 2),
                'card_total': round(ds_card, 2),
                'upi_total':  round(ds_upi, 2),
            },
            'direct_sales': [{
                'id':           s['id'],
                'sale_number':  s['sale_number'] or '—',
                'item_name':    s['item__name'],
                'price':        float(s['price']),
                'payment_type': s['payment_type'],
                'date':         s['date'],
            } for s in ds_list],
            'date_from': date_from,
            'date_to':   date_to,
        })

    @action(detail=False, methods=['get'])
    def item_wise_report(self, request):
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        items = SaleItem.objects.all()
        if date_from: items = items.filter(bill__created_at__date__gte=date_from)
        if date_to:   items = items.filter(bill__created_at__date__lte=date_to)
        report = items.values(
            'product__id', 'product__name', 'product__barcode', 'price'
        ).annotate(total_qty=Sum('quantity')).order_by('product__name')
        return Response([{
            'product_id':      r['product__id'],
            'product_name':    r['product__name'],
            'product_barcode': r['product__barcode'],
            'mrp':             r['price'],
            'quantity_sold':   r['total_qty'],
            'total_amount':    float(r['price']) * float(r['total_qty']),
        } for r in report])

    @action(detail=False, methods=['get'])
    def sales_tax_report(self, request):
        """
        Item-based sales tax report matching the bill print calculation:
        - total       = selling_price × qty   (tax-inclusive amount)
        - taxable     = total / (1 + tax_rate/100)   (back-calculate taxable)
        - item_tax    = total - taxable
        - cgst = sgst = item_tax / 2
        CGST rate = SGST rate = tax_rate / 2
        """
        date_from  = request.query_params.get('date_from')
        date_to    = request.query_params.get('date_to')
        tax_filter = request.query_params.get('tax_rate')

        qs = SaleItem.objects.select_related('product', 'bill').order_by('bill__created_at')
        if date_from: qs = qs.filter(bill__created_at__date__gte=date_from)
        if date_to:   qs = qs.filter(bill__created_at__date__lte=date_to)

        items_data      = []
        grand_taxable   = 0
        grand_cgst      = 0
        grand_sgst      = 0
        grand_total_tax = 0
        all_tax_rates   = set()

        for item in qs:
            tax_rate = float(item.tax or 0)

            # Skip zero-tax items (nothing to show in tax report)
            if tax_rate == 0:
                all_tax_rates.add(0.0)
                continue

            qty           = float(item.quantity)
            price         = float(item.price)     # selling price (MRP, tax-inclusive)
            total         = price * qty            # total paid by customer
            # Back-calculate taxable from tax-inclusive total (same as PrintBill)
            taxable_amt   = total / (1 + tax_rate / 100)
            item_tax      = total - taxable_amt
            cgst_amt      = item_tax / 2
            sgst_amt      = item_tax / 2
            cgst_rate     = tax_rate / 2
            sgst_rate     = tax_rate / 2

            all_tax_rates.add(tax_rate)

            if tax_filter:
                try:
                    if abs(tax_rate - float(tax_filter)) > 0.001:
                        continue
                except ValueError:
                    pass

            items_data.append({
                'bill_number':     item.bill.bill_number,
                'date':            item.bill.created_at,
                'product_name':    item.product.name,
                'product_barcode': item.product.barcode,
                'quantity':        qty,
                'selling_price':   round(price, 2),
                'total_amount':    round(total, 2),
                'taxable_amount':  round(taxable_amt, 2),
                'tax_rate':        tax_rate,
                'cgst_rate':       cgst_rate,
                'sgst_rate':       sgst_rate,
                'cgst':            round(cgst_amt, 2),
                'sgst':            round(sgst_amt, 2),
                'total_tax':       round(item_tax, 2),
            })
            grand_taxable   += taxable_amt
            grand_cgst      += cgst_amt
            grand_sgst      += sgst_amt
            grand_total_tax += item_tax

        return Response({
            'items':               items_data,
            'grand_taxable':       round(grand_taxable, 2),
            'grand_cgst':          round(grand_cgst, 2),
            'grand_sgst':          round(grand_sgst, 2),
            'grand_tax':           round(grand_total_tax, 2),
            'available_tax_rates': sorted(all_tax_rates),
        })


class ReturnItemViewSet(viewsets.ModelViewSet):
    queryset           = ReturnItem.objects.all().order_by('-date')
    serializer_class   = ReturnItemSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save()


class InternalSaleMasterViewSet(viewsets.ModelViewSet):
    queryset           = InternalSaleMaster.objects.all().order_by('name')
    serializer_class   = InternalSaleMasterSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class InternalSaleViewSet(viewsets.ModelViewSet):
    queryset           = InternalSale.objects.all().order_by('-date')
    serializer_class   = InternalSaleSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def report(self, request):
        date_from    = request.query_params.get('date_from')
        date_to      = request.query_params.get('date_to')
        dest_ids_raw = request.query_params.get('destinations', '')
        items = InternalSale.objects.all()
        if date_from: items = items.filter(date__date__gte=date_from)
        if date_to:   items = items.filter(date__date__lte=date_to)
        if dest_ids_raw:
            dest_ids = [int(x) for x in dest_ids_raw.split(',') if x.strip().isdigit()]
            if dest_ids: items = items.filter(destination__id__in=dest_ids)
        report = items.values(
            'product__id', 'product__name', 'product__barcode',
            'destination__id', 'destination__name', 'price'
        ).annotate(total_qty=Sum('quantity')).order_by('destination__name', 'product__name')
        return Response([{
            'product_id':      r['product__id'],
            'product_name':    r['product__name'],
            'product_barcode': r['product__barcode'],
            'destination_id':  r['destination__id'],
            'destination_name':r['destination__name'],
            'mrp':             r['price'],
            'quantity':        r['total_qty'],
            'total_amount':    float(r['price']) * float(r['total_qty']),
        } for r in report])


class PurchaseReturnViewSet(viewsets.ModelViewSet):
    queryset           = PurchaseReturn.objects.all().order_by('-date')
    serializer_class   = PurchaseReturnSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        product        = serializer.validated_data.get('product')
        vendor         = serializer.validated_data.get('vendor')
        given_price    = serializer.validated_data.get('purchase_price')
        given_tax      = serializer.validated_data.get('tax')

        # Only auto-fill from last purchase if user didn't provide values
        extra = {}
        if not given_price or float(given_price) == 0:
            if vendor:
                last = Purchase.objects.filter(product=product, bill__vendor=vendor).order_by('-date').first()
            else:
                last = None
            if not last:
                last = Purchase.objects.filter(product=product).order_by('-date').first()
            if last:
                extra['purchase_price'] = last.purchase_price
                if not given_tax:
                    extra['tax'] = last.tax

        serializer.save(created_by=self.request.user, **extra)

    @action(detail=True, methods=['patch'])
    def mark_returned(self, request, pk=None):
        pr = self.get_object()
        pr.status = 'returned'
        pr.save()
        return Response(PurchaseReturnSerializer(pr).data)

    @action(detail=False, methods=['get'])
    def report(self, request):
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        returns   = PurchaseReturn.objects.all()
        if date_from: returns = returns.filter(date__date__gte=date_from)
        if date_to:   returns = returns.filter(date__date__lte=date_to)
        returns = returns.order_by('-date')
        result = []
        for r in returns:
            price_with_tax = float(r.purchase_price) * (1 + float(r.tax) / 100)
            result.append({
                'id':              r.id,
                'return_number':   r.return_number or '—',
                'product_name':    r.product.name,
                'product_barcode': r.product.barcode,
                'mrp':             float(r.product.selling_price),
                'vendor_name':     r.vendor.name if r.vendor else '—',
                'quantity':        float(r.quantity),
                'purchase_price':  float(r.purchase_price),
                'tax':             float(r.tax),
                'item_cost':       round(price_with_tax * float(r.quantity), 2),
                'reason':          r.reason,
                'status':          r.status,
                'date':            r.date,
            })
        pending_count = PurchaseReturn.objects.filter(status='pending').count()
        return Response({
            'returns':      result,
            'total_cost':   sum(r['item_cost'] for r in result),
            'pending_count':pending_count,
        })


class DirectSaleMasterViewSet(viewsets.ModelViewSet):
    queryset           = DirectSaleMaster.objects.all().order_by('name')
    serializer_class   = DirectSaleMasterSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class DirectSaleViewSet(viewsets.ModelViewSet):
    queryset           = DirectSale.objects.all().order_by('-date')
    serializer_class   = DirectSaleSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        sale_number = DirectSale.generate_sale_number()
        serializer.save(created_by=self.request.user, sale_number=sale_number)

    @action(detail=False, methods=['get'])
    def report(self, request):
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        sales = DirectSale.objects.all().select_related('item', 'created_by')
        if date_from: sales = sales.filter(date__date__gte=date_from)
        if date_to:   sales = sales.filter(date__date__lte=date_to)
        sales = sales.order_by('-date')
        result = []
        grand_total = 0
        for s in sales:
            result.append({
                'id':           s.id,
                'sale_number':  s.sale_number or '—',
                'item_name':    s.item.name,
                'price':        float(s.price),
                'payment_type': s.payment_type,
                'cash_amount':  float(s.cash_amount),
                'card_amount':  float(s.card_amount),
                'upi_amount':   float(s.upi_amount),
                'date':         s.date,
                'created_by':   s.created_by.username if s.created_by else '—',
            })
            grand_total += float(s.price)
        pure_cash  = sum(s['price'] for s in result if s['payment_type'] == 'cash')
        split_cash = sum(s['cash_amount'] for s in result if s['payment_type'] in ['cash_card', 'cash_upi'])
        pure_card  = sum(s['price'] for s in result if s['payment_type'] == 'card')
        split_card = sum(s['card_amount'] for s in result if s['payment_type'] == 'cash_card')
        pure_upi   = sum(s['price'] for s in result if s['payment_type'] == 'upi')
        split_upi  = sum(s['upi_amount'] for s in result if s['payment_type'] == 'cash_upi')
        return Response({
            'sales':       result,
            'grand_total': round(grand_total, 2),
            'cash_total':  round(pure_cash + split_cash, 2),
            'card_total':  round(pure_card + split_card, 2),
            'upi_total':   round(pure_upi  + split_upi,  2),
        })


class StockAdjustmentRequestViewSet(viewsets.ModelViewSet):
    queryset           = StockAdjustmentRequest.objects.all().order_by('-created_at')
    serializer_class   = StockAdjustmentRequestSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)

    @action(detail=True, methods=['patch'])
    def approve(self, request, pk=None):
        from decimal import Decimal
        adj = self.get_object()
        if adj.status != 'pending':
            return Response({'error': 'Already reviewed'}, status=400)
        product = adj.product
        new_qty = Decimal(str(adj.physical_stock))
        product.stock_quantity = new_qty
        product.save()
        old_total = sum(
            Decimal(str(b.quantity))
            for b in StockBatch.objects.filter(product=product, quantity__gt=0)
        )
        if old_total > 0:
            ratio = new_qty / old_total
            for b in StockBatch.objects.filter(product=product):
                b.quantity = (Decimal(str(b.quantity)) * ratio).quantize(Decimal('0.001'))
                b.save()
        elif new_qty > 0:
            StockBatch.objects.create(product=product, mrp=product.selling_price, quantity=new_qty)
        adj.status      = 'approved'
        adj.reviewed_by = request.user
        adj.reviewed_at = timezone.now()
        adj.save()
        return Response(StockAdjustmentRequestSerializer(adj).data)

    @action(detail=True, methods=['patch'])
    def reject(self, request, pk=None):
        adj = self.get_object()
        if adj.status != 'pending':
            return Response({'error': 'Already reviewed'}, status=400)
        adj.status      = 'rejected'
        adj.reviewed_by = request.user
        adj.reviewed_at = timezone.now()
        adj.save()
        return Response(StockAdjustmentRequestSerializer(adj).data)


class StockTransferViewSet(viewsets.ModelViewSet):
    queryset           = StockTransfer.objects.all().order_by('-date')
    serializer_class   = StockTransferSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class BackupView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Export full database as JSON."""
        if request.user.role != 'admin':
            return Response({'detail': 'Admin only'}, status=403)

        def serialize_qs(qs):
            rows = []
            for obj in qs:
                row = {}
                for field in obj._meta.fields:
                    # For FK fields, use attname (e.g. product_id) to get the raw integer
                    attr = field.attname  # gives 'product_id' instead of 'product'
                    val  = getattr(obj, attr)
                    if isinstance(val, Decimal):
                        val = str(val)
                    elif hasattr(val, 'isoformat'):
                        val = val.isoformat()
                    row[attr] = val
                rows.append(row)
            return rows

        data = {
            'version': 1,
            'exported_at': timezone.now().isoformat(),
            'vendors':               serialize_qs(Vendor.objects.all()),
            'products':              serialize_qs(Product.objects.all()),
            'stock_batches':         serialize_qs(StockBatch.objects.all()),
            'purchase_bills':        serialize_qs(PurchaseBill.objects.all()),
            'purchases':             serialize_qs(Purchase.objects.all()),
            'sale_bills':            serialize_qs(SaleBill.objects.all()),
            'sale_items':            serialize_qs(SaleItem.objects.all()),
            'return_items':          serialize_qs(ReturnItem.objects.all()),
            'internal_masters':      serialize_qs(InternalSaleMaster.objects.all()),
            'internal_sale_bills':   serialize_qs(InternalSaleBill.objects.all()),
            'internal_sales':        serialize_qs(InternalSale.objects.all()),
            'purchase_returns':      serialize_qs(PurchaseReturn.objects.all()),
            'direct_masters':        serialize_qs(DirectSaleMaster.objects.all()),
            'direct_sales':          serialize_qs(DirectSale.objects.all()),
            'stock_transfers':       serialize_qs(StockTransfer.objects.all()),
            'item_returns':          serialize_qs(ItemReturn.objects.all()),
            'item_return_lines':     serialize_qs(ItemReturnLine.objects.all()),
            'physical_stock_reqs':   serialize_qs(PhysicalStockRequest.objects.all()),
            'stock_adjustments':     serialize_qs(StockAdjustmentRequest.objects.all()),
        }
        from django.http import JsonResponse
        response = JsonResponse(data)
        filename = f"bakesale_backup_{timezone.now().strftime('%d-%m-%y_%I-%M%p')}.json"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    def post(self, request):
        """Restore database from uploaded JSON backup."""
        if request.user.role != 'admin':
            return Response({'detail': 'Admin only'}, status=403)
        try:
            if request.FILES.get('file'):
                upload = request.FILES['file']
                # Limit backup file to 50MB
                if upload.size > 50 * 1024 * 1024:
                    return Response({'detail': 'Backup file too large (max 50MB)'}, status=400)
                raw = upload.read()
                data = json.loads(raw)
            else:
                data = request.data
            if data.get('version') != 1:
                return Response({'detail': 'Invalid or unsupported backup format'}, status=400)
            from django.db import transaction
            with transaction.atomic():
                # Delete in reverse dependency order
                StockAdjustmentRequest.objects.all().delete()
                PhysicalStockRequest.objects.all().delete()
                ItemReturnLine.objects.all().delete()
                ItemReturn.objects.all().delete()
                DirectSale.objects.all().delete()
                DirectSaleMaster.objects.all().delete()
                InternalSale.objects.all().delete()
                InternalSaleBill.objects.all().delete()
                InternalSaleMaster.objects.all().delete()
                PurchaseReturn.objects.all().delete()
                ReturnItem.objects.all().delete()
                SaleItem.objects.all().delete()
                SaleBill.objects.all().delete()
                Purchase.objects.all().delete()
                PurchaseBill.objects.all().delete()
                StockBatch.objects.all().delete()
                StockTransfer.objects.all().delete()
                Product.objects.all().delete()
                Vendor.objects.all().delete()

                def d(v):
                    return Decimal(str(v)) if v is not None else None

                for r in data.get('vendors', []):
                    Vendor.objects.create(
                        id=r['id'], name=r['name'],
                        phone=r.get('phone'), is_active=r.get('is_active', True),
                    )

                for r in data.get('products', []):
                    Product.objects.create(
                        id=r['id'], barcode=r['barcode'], name=r['name'],
                        selling_price=d(r['selling_price']),
                        selling_unit=r.get('selling_unit', 'nos'),
                        tax=d(r.get('tax', 0)),
                        stock_quantity=d(r.get('stock_quantity', 0)),
                        damaged_quantity=d(r.get('damaged_quantity', 0)),
                        expired_quantity=d(r.get('expired_quantity', 0)),
                        is_active=r.get('is_active', True),
                    )

                for r in data.get('stock_batches', []):
                    StockBatch.objects.create(
                        id=r['id'], product_id=r['product_id'],
                        mrp=d(r['mrp']), quantity=d(r.get('quantity', 0)),
                    )

                for r in data.get('purchase_bills', []):
                    PurchaseBill.objects.create(
                        id=r['id'], purchase_number=r['purchase_number'],
                        vendor_id=r.get('vendor_id'), is_paid=r.get('is_paid', True),
                        created_by_id=None,
                    )

                for r in data.get('purchases', []):
                    Purchase.objects.create(
                        id=r['id'], bill_id=r.get('bill_id'),
                        product_id=r['product_id'],
                        purchase_unit=r.get('purchase_unit', 'nos'),
                        quantity=d(r['quantity']),
                        purchase_price=d(r['purchase_price']),
                        tax=d(r.get('tax', 0)),
                        tax_type=r.get('tax_type', 'excluding'),
                        mrp=d(r['mrp']),
                        selling_unit=r.get('selling_unit', 'nos'),
                        selling_qty=d(r.get('selling_qty', 1)),
                    )

                for r in data.get('sale_bills', []):
                    SaleBill.objects.create(
                        id=r['id'], bill_number=r['bill_number'],
                        total_amount=d(r['total_amount']),
                        payment_type=r['payment_type'],
                        cash_amount=d(r.get('cash_amount', 0)),
                        card_amount=d(r.get('card_amount', 0)),
                        upi_amount=d(r.get('upi_amount', 0)),
                        created_by_id=None,
                    )

                for r in data.get('sale_items', []):
                    SaleItem.objects.create(
                        id=r['id'], bill_id=r['bill_id'],
                        product_id=r['product_id'],
                        batch_id=r.get('batch_id'),
                        quantity=d(r['quantity']),
                        price=d(r['price']),
                        tax=d(r.get('tax', 0))
                    )

                for r in data.get('return_items', []):
                    ReturnItem.objects.create(
                        id=r['id'], product_id=r['product_id'],
                        return_type=r['return_type'],
                        quantity=d(r.get('quantity', 1)),
                        processed_by_id=None,
                    )

                for r in data.get('internal_masters', []):
                    InternalSaleMaster.objects.create(
                        id=r['id'], name=r['name'],
                        is_active=r.get('is_active', True),
                        created_by_id=None,
                    )

                for r in data.get('internal_sales', []):
                    InternalSale.objects.create(
                        id=r['id'], product_id=r['product_id'],
                        destination_id=r['destination_id'],
                        bill_id=r.get('bill_id'),
                        quantity=d(r['quantity']),
                        price=d(r['price']),
                        created_by_id=None,
                    )

                for r in data.get('purchase_returns', []):
                    PurchaseReturn.objects.create(
                        id=r['id'], product_id=r['product_id'],
                        vendor_id=r.get('vendor_id'),
                        quantity=d(r['quantity']),
                        purchase_price=d(r.get('purchase_price', 0)),
                        tax=d(r.get('tax', 0)),
                        reason=r.get('reason', ''),
                        status=r.get('status', 'pending'),
                        created_by_id=None,
                    )

                for r in data.get('direct_masters', []):
                    DirectSaleMaster.objects.create(
                        id=r['id'], name=r['name'],
                        is_active=r.get('is_active', True),
                        created_by_id=None,
                    )

                for r in data.get('direct_sales', []):
                    DirectSale.objects.create(
                        id=r['id'], item_id=r['item_id'],
                        price=d(r['price']),
                        payment_type=r['payment_type'],
                        cash_amount=d(r.get('cash_amount', 0)),
                        card_amount=d(r.get('card_amount', 0)),
                        upi_amount=d(r.get('upi_amount', 0)),
                        created_by_id=None,
                    )

                for r in data.get('stock_transfers', []):
                    StockTransfer.objects.create(
                        id=r['id'], product_id=r['product_id'],
                        quantity=d(r['quantity']),
                        mrp=d(r['mrp']),
                        purchase_price=d(r.get('purchase_price', 0)),
                        tax=d(r.get('tax', 0)),
                        created_by_id=None,
                    )

                # InternalSaleBills
                for r in data.get('internal_sale_bills', []):
                    InternalSaleBill.objects.create(
                        id=r['id'],
                        destination_id=r['destination_id'],
                        sale_number=r.get('sale_number', ''),
                        created_by_id=None,
                    )

                # ItemReturns
                for r in data.get('item_returns', []):
                    ItemReturn.objects.create(
                        id=r['id'],
                        return_number=r.get('return_number', ''),
                        payment_type=r.get('payment_type', 'cash'),
                        cash_amount=d(r.get('cash_amount', 0)),
                        card_amount=d(r.get('card_amount', 0)),
                        upi_amount=d(r.get('upi_amount', 0)),
                        total_amount=d(r.get('total_amount', 0)),
                        created_by_id=None,
                    )

                # ItemReturnLines
                for r in data.get('item_return_lines', []):
                    ItemReturnLine.objects.create(
                        id=r['id'],
                        item_return_id=r['item_return_id'],
                        product_id=r['product_id'],
                        sale_bill_id=r.get('sale_bill_id'),
                        quantity=d(r['quantity']),
                        price=d(r['price']),
                        return_type=r.get('return_type', 'customer_return'),
                    )

                # PhysicalStockRequests
                for r in data.get('physical_stock_reqs', []):
                    PhysicalStockRequest.objects.create(
                        id=r['id'],
                        request_number=r.get('request_number', ''),
                        status=r.get('status', 'pending'),
                        reason=r.get('reason', ''),
                        requested_by_id=None,
                        reviewed_by_id=None,
                    )

                # StockAdjustmentRequests
                for r in data.get('stock_adjustments', []):
                    StockAdjustmentRequest.objects.create(
                        id=r['id'],
                        ps_request_id=r.get('ps_request_id'),
                        product_id=r['product_id'],
                        system_stock=d(r['system_stock']),
                        physical_stock=d(r['physical_stock']),
                        status=r.get('status', 'pending'),
                        reason=r.get('reason', ''),
                        requested_by_id=None,
                        reviewed_by_id=None,
                    )

            # Reset PostgreSQL sequences so new records don't conflict
            from django.db import connection
            tables_with_sequences = [
                ('api_vendor',              'id'),
                ('api_product',             'id'),
                ('api_stockbatch',          'id'),
                ('api_purchasebill',        'id'),
                ('api_purchase',            'id'),
                ('api_salebill',            'id'),
                ('api_saleitem',            'id'),
                ('api_returnitem',          'id'),
                ('api_internalsalemaster',  'id'),
                ('api_internalsalebill',    'id'),
                ('api_internalsale',        'id'),
                ('api_purchasereturn',      'id'),
                ('api_directsalemaster',    'id'),
                ('api_directsale',          'id'),
                ('api_stocktransfer',       'id'),
                ('api_itemreturn',          'id'),
                ('api_itemreturnline',      'id'),
                ('api_physicalstockrequest','id'),
                ('api_stockadjustmentrequest','id'),
            ]
            with connection.cursor() as cursor:
                for table, col in tables_with_sequences:
                    cursor.execute(
                        f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), "
                        f"COALESCE((SELECT MAX({col}) FROM {table}), 0) + 1, false)"
                    )

            return Response({'detail': 'Backup restored successfully'})
        except Exception as e:
            return Response({'detail': f'Restore failed: {str(e)}'}, status=400)


class UserPermissionViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def get_or_create_perm(self, user):
        perm, _ = UserPermission.objects.get_or_create(user=user)
        return perm

    @action(detail=False, methods=['get'], url_path='me')
    def my_permissions(self, request):
        """Get permissions for the currently logged-in user."""
        if request.user.role == 'admin':
            return Response({'is_admin': True})
        perm = self.get_or_create_perm(request.user)
        return Response({'is_admin': False, **UserPermissionSerializer(perm).data})

    def list(self, request):
        """List all general users with their permissions (admin only)."""
        if request.user.role != 'admin':
            return Response({'detail': 'Admin only'}, status=403)
        users  = User.objects.filter(role='general').order_by('username')
        result = []
        for u in users:
            perm = self.get_or_create_perm(u)
            result.append({
                'user_id':   u.id,
                'username':  u.username,
                'is_active': u.is_active,
                **UserPermissionSerializer(perm).data,
            })
        return Response(result)

    @action(detail=False, methods=['patch'], url_path='update/(?P<user_id>[^/.]+)')
    def update_permissions(self, request, user_id=None):
        """Update permissions for a specific user (admin only)."""
        if request.user.role != 'admin':
            return Response({'detail': 'Admin only'}, status=403)
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'User not found'}, status=404)
        perm       = self.get_or_create_perm(user)
        serializer = UserPermissionSerializer(perm, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

# ── ItemReturn ViewSet ────────────────────────────────────────────────────────

class ItemReturnViewSet(viewsets.ModelViewSet):
    queryset           = ItemReturn.objects.all().order_by('-date')
    serializer_class   = ItemReturnSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def create(self, request, *args, **kwargs):
        """
        POST /item-returns/
        {
          "lines": [
            {
              "product": 5,
              "quantity": 2,
              "price": 45.00,
              "return_type": "customer_return",
              "sale_bill": 12   // optional
            }
          ],
          "payment_type": "cash",
          "cash_amount": 90,
          "card_amount": 0,
          "upi_amount": 0
        }
        """
        from decimal import Decimal
        data      = request.data
        lines     = data.get('lines', [])
        pay_type  = data.get('payment_type', 'cash')
        cash_amt  = Decimal(str(data.get('cash_amount', 0)))
        card_amt  = Decimal(str(data.get('card_amount', 0)))
        upi_amt   = Decimal(str(data.get('upi_amount', 0)))

        if not lines:
            return Response({'error': 'No items provided'}, status=400)

        # Calculate total
        total = sum(Decimal(str(l['quantity'])) * Decimal(str(l['price'])) for l in lines)

        # Create header
        ir = ItemReturn.objects.create(
            payment_type=pay_type,
            cash_amount=cash_amt,
            card_amount=card_amt,
            upi_amount=upi_amt,
            total_amount=total,
            created_by=request.user,
        )

        for l in lines:
            product  = Product.objects.get(id=l['product'])
            qty      = Decimal(str(l['quantity']))
            price    = Decimal(str(l['price']))
            rtype    = l.get('return_type', 'customer_return')
            bill_id  = l.get('sale_bill')
            sale_bill = None

            if bill_id:
                try:
                    sale_bill = SaleBill.objects.get(id=bill_id)
                    # Do NOT modify bill total or amounts
                    # Just link the return to this bill for reference
                except SaleBill.DoesNotExist:
                    pass

            # Restore stock for customer return
            if rtype == 'customer_return':
                product.stock_quantity += qty
            elif rtype == 'damaged':
                product.damaged_quantity += qty
                product.stock_quantity = max(Decimal('0'), product.stock_quantity - qty)
            elif rtype == 'expired':
                product.expired_quantity += qty
                product.stock_quantity = max(Decimal('0'), product.stock_quantity - qty)
            product.save()

            ItemReturnLine.objects.create(
                item_return=ir,
                product=product,
                sale_bill=sale_bill,
                quantity=qty,
                price=price,
                return_type=rtype,
            )

        return Response(ItemReturnSerializer(ir).data, status=201)

    @action(detail=False, methods=['get'])
    def report(self, request):
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        qs = ItemReturn.objects.prefetch_related('lines__product', 'lines__sale_bill').order_by('-date')
        if date_from: qs = qs.filter(date__date__gte=date_from)
        if date_to:   qs = qs.filter(date__date__lte=date_to)
        result = []
        for ir in qs:
            lines = []
            for l in ir.lines.all():
                lines.append({
                    'product_id':   l.product.id,
                    'product_name': l.product.name,
                    'barcode':      l.product.barcode,
                    'quantity':     float(l.quantity),
                    'price':        float(l.price),
                    'total':        float(l.quantity * l.price),
                    'return_type':  l.return_type,
                    'sale_bill_id': l.sale_bill.id if l.sale_bill else None,
                    'sale_bill_number': l.sale_bill.bill_number if l.sale_bill else None,
                })
            result.append({
                'id':            ir.id,
                'return_number': ir.return_number,
                'date':          ir.date,
                'total_amount':  float(ir.total_amount),
                'payment_type':  ir.payment_type,
                'cash_amount':   float(ir.cash_amount),
                'card_amount':   float(ir.card_amount),
                'upi_amount':    float(ir.upi_amount),
                'created_by':    ir.created_by.username if ir.created_by else '—',
                'lines':         lines,
            })
        grand_total = sum(r['total_amount'] for r in result)
        return Response({'returns': result, 'grand_total': round(grand_total, 2)})

    @action(detail=False, methods=['get'])
    def bills_with_product(self, request):
        """
        GET /item-returns/bills_with_product/?product_id=5&qty=2
        Returns all bills containing the product with qty >= requested qty
        """
        product_id = request.query_params.get('product_id')
        qty        = request.query_params.get('qty', 1)
        if not product_id:
            return Response({'error': 'product_id required'}, status=400)
        try:
            qty = Decimal(str(qty))
        except Exception:
            qty = Decimal('1')

        sale_items = SaleItem.objects.filter(
            product_id=product_id,
            quantity__gte=qty
        ).select_related('bill', 'product').order_by('-bill__created_at')

        result = []
        for si in sale_items:
            result.append({
                'bill_id':      si.bill.id,
                'bill_number':  si.bill.bill_number,
                'bill_date':    si.bill.created_at,
                'item_qty':     float(si.quantity),
                'item_price':   float(si.price),
                'bill_total':   float(si.bill.total_amount),
                'payment_type': si.bill.payment_type,
            })
        return Response(result)


# ── InternalSaleBill ViewSet ──────────────────────────────────────────────────

class InternalSaleBillViewSet(viewsets.ModelViewSet):
    queryset           = InternalSaleBill.objects.all().order_by('-date')
    serializer_class   = InternalSaleBillSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        """
        POST /internal-sale-bills/
        {
          "destination": 3,
          "items": [
            {"product": 5, "quantity": 2, "price": 45.00},
            {"product": 7, "quantity": 1, "price": 30.00}
          ]
        }
        """
        from decimal import Decimal
        data        = request.data
        dest_id     = data.get('destination')
        items_data  = data.get('items', [])

        if not dest_id or not items_data:
            return Response({'error': 'destination and items required'}, status=400)

        destination = InternalSaleMaster.objects.get(id=dest_id)
        bill = InternalSaleBill.objects.create(
            destination=destination,
            created_by=request.user,
        )

        for item in items_data:
            product = Product.objects.get(id=item['product'])
            qty     = Decimal(str(item['quantity']))
            price   = Decimal(str(item.get('price', product.selling_price)))
            InternalSale.objects.create(
                bill=bill,
                product=product,
                destination=destination,
                quantity=qty,
                price=price,
                created_by=request.user,
            )
            product.stock_quantity = max(Decimal('0'), product.stock_quantity - qty)
            product.save()

        return Response(InternalSaleBillSerializer(bill).data, status=201)

    @action(detail=False, methods=['get'])
    def report(self, request):
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        qs = InternalSaleBill.objects.prefetch_related('items__product').order_by('-date')
        if date_from: qs = qs.filter(date__date__gte=date_from)
        if date_to:   qs = qs.filter(date__date__lte=date_to)
        result = []
        for bill in qs:
            items = bill.items.all()
            total = sum(float(i.quantity) * float(i.price) for i in items)
            item_names = ', '.join(i.product.name for i in items)
            result.append({
                'id':               bill.id,
                'sale_number':      bill.sale_number,
                'date':             bill.date,
                'destination_name': bill.destination.name,
                'item_names':       item_names,
                'total_amount':     round(total, 2),
                'created_by':       bill.created_by.username if bill.created_by else '—',
                'items': [{
                    'product_id':   i.product.id,
                    'product_name': i.product.name,
                    'barcode':      i.product.barcode,
                    'quantity':     float(i.quantity),
                    'price':        float(i.price),
                    'total':        round(float(i.quantity) * float(i.price), 2),
                } for i in items],
            })
        grand_total = sum(r['total_amount'] for r in result)
        return Response({'bills': result, 'grand_total': round(grand_total, 2)})


# ── PhysicalStockRequest ViewSet ──────────────────────────────────────────────

class PhysicalStockRequestViewSet(viewsets.ModelViewSet):
    queryset           = PhysicalStockRequest.objects.all().order_by('-created_at')
    permission_classes = [IsAuthenticated]
    serializer_class   = StockAdjustmentRequestSerializer  # reuse, we'll add custom

    def list(self, request):
        qs = PhysicalStockRequest.objects.prefetch_related(
            'items__product', 'requested_by', 'reviewed_by'
        ).order_by('-created_at')
        result = []
        for ps in qs:
            items = []
            for item in ps.items.all():
                items.append({
                    'id':             item.id,
                    'product_id':     item.product.id,
                    'product_name':   item.product.name,
                    'product_barcode':item.product.barcode,
                    'mrp':            float(item.product.selling_price),
                    'selling_unit':   item.product.selling_unit,
                    'system_stock':   float(item.system_stock),
                    'physical_stock': float(item.physical_stock),
                    'status':         item.status,
                })
            result.append({
                'id':             ps.id,
                'request_number': ps.request_number,
                'status':         ps.status,
                'reason':         ps.reason,
                'requested_by':   ps.requested_by.username if ps.requested_by else '—',
                'reviewed_by':    ps.reviewed_by.username  if ps.reviewed_by  else '—',
                'created_at':     ps.created_at,
                'reviewed_at':    ps.reviewed_at,
                'items':          items,
                'item_count':     len(items),
            })
        return Response(result)

    def create(self, request):
        """
        POST /physical-stock-requests/
        { items: [{product, system_stock, physical_stock}], reason: '' }
        """
        items_data = request.data.get('items', [])
        reason     = request.data.get('reason', '')
        if not items_data:
            return Response({'error': 'No items provided'}, status=400)
        ps = PhysicalStockRequest.objects.create(
            reason=reason,
            requested_by=request.user,
        )
        for item in items_data:
            StockAdjustmentRequest.objects.create(
                ps_request=ps,
                product_id=item['product'],
                system_stock=item['system_stock'],
                physical_stock=item['physical_stock'],
                reason=reason,
                requested_by=request.user,
            )
        return Response({'id': ps.id, 'request_number': ps.request_number}, status=201)

    @action(detail=True, methods=['patch'])
    def approve(self, request, pk=None):
        from decimal import Decimal
        from django.db.models import Sum

        ps = PhysicalStockRequest.objects.get(pk=pk)
        if ps.status != 'pending':
            return Response({'error': 'Already processed'}, status=400)

        ps.status      = 'approved'
        ps.reviewed_by = request.user
        ps.reviewed_at = timezone.now()
        ps.save()

        for item in ps.items.all():
            item.status      = 'approved'
            item.reviewed_by = request.user
            item.reviewed_at = timezone.now()
            item.save()

            product      = item.product
            new_qty      = Decimal(str(item.physical_stock))

            # ── FIX: update StockBatch quantities so sale search sees correct stock ──
            # Get current total batch quantity
            old_total = StockBatch.objects.filter(
                product=product
            ).aggregate(t=Sum('quantity'))['t'] or Decimal('0')

            if old_total > 0:
                # Scale existing batches proportionally to match new total
                ratio = new_qty / old_total
                for b in StockBatch.objects.filter(product=product):
                    b.quantity = (Decimal(str(b.quantity)) * ratio).quantize(Decimal('0.001'))
                    b.save()
            elif new_qty > 0:
                # No batches exist — create one at current selling price
                existing = StockBatch.objects.filter(product=product).first()
                if existing:
                    # Zero out all, set the first one to new_qty
                    StockBatch.objects.filter(product=product).update(quantity=Decimal('0'))
                    existing.quantity = new_qty
                    existing.save()
                else:
                    StockBatch.objects.create(
                        product=product,
                        mrp=product.selling_price,
                        quantity=new_qty
                    )
            else:
                # new_qty is 0 — zero out all batches
                StockBatch.objects.filter(product=product).update(quantity=Decimal('0'))

            # Update the denormalized field on Product
            product.stock_quantity = new_qty
            product.save()

        return Response({'status': 'approved'})
    

class SyncStockView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'admin':
            return Response({'detail': 'Admin only'}, status=403)
        
        from django.db.models import Sum
        fixed = []
        for product in Product.objects.prefetch_related('batches').all():
            batch_total = product.batches.filter(
                quantity__gt=0
            ).aggregate(t=Sum('quantity'))['t'] or Decimal('0')
            
            if abs(float(product.stock_quantity) - float(batch_total)) > 0.001:
                fixed.append({
                    'product': product.name,
                    'was': float(product.stock_quantity),
                    'now': float(batch_total),
                })
                product.stock_quantity = batch_total
                product.save()
        
        return Response({
            'fixed': len(fixed),
            'details': fixed,
        })