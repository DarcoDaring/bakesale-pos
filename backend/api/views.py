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
    UserPermissionSerializer, ItemReturnSerializer, PhysicalStockRequestSerializer
)
from .permissions import IsAdminUser
from .kc_views import (
    KCSaleItemViewSet, KCBillViewSet, KCPurchaseViewSet,
    KCStockViewSet, KCStoreItemViewSet, KCStoreIssueViewSet,
    KCReportView, KCClosingStockViewSet,
)


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
    """
    FIX: Removed side-effect stock sync from this read-only helper.
    The sync belonged in a dedicated management command, not in every
    product search / barcode lookup call.
    """
    rows = []
    for p in products:
        batches = list(p.batches.filter(quantity__gt=0).order_by('mrp', 'created_at'))
        if not batches:
            rows.append({
                'id': p.id, 'barcode': p.barcode, 'name': p.name,
                'selling_price': str(p.selling_price), 'selling_unit': p.selling_unit,
                'tax': float(p.tax or 0),
                'stock_quantity': '0', 'is_active': p.is_active,
                'batch_id': None, 'batch_mrp': None, 'multi_batch': False
            })
        elif len(batches) == 1:
            b = batches[0]
            rows.append({
                'id': p.id, 'barcode': p.barcode, 'name': p.name,
                'selling_price': str(b.mrp), 'selling_unit': p.selling_unit,
                'tax': float(p.tax or 0),
                'stock_quantity': str(b.quantity),
                'is_active': p.is_active,
                'batch_id': b.id, 'batch_mrp': str(b.mrp), 'multi_batch': False
            })
        else:
            for b in batches:
                rows.append({
                    'id': p.id, 'barcode': p.barcode, 'name': p.name,
                    'selling_price': str(b.mrp), 'selling_unit': p.selling_unit,
                    'tax': float(p.tax or 0),
                    'stock_quantity': str(b.quantity),
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
        from django.utils.dateparse import parse_date
        from django.utils import timezone as tz
        import datetime

        bill_date   = self.request.data.get('bill_date')
        parsed_date = parse_date(bill_date) if bill_date else None
        instance    = serializer.save(created_by=self.request.user)

        if parsed_date:
            # FIX: Use timezone-aware datetime to avoid off-by-one date bugs
            aware_dt = tz.make_aware(
                datetime.datetime.combine(parsed_date, instance.date.time())
            )
            PurchaseBill.objects.filter(pk=instance.pk).update(date=aware_dt)

    @action(detail=True, methods=['patch'])
    def mark_paid(self, request, pk=None):
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

            round_off  = float(b.round_off or 0)
            bill_total = bill_taxable + bill_tax + round_off
            grand_total += bill_total
            result.append({
                'id':                   b.id,
                'purchase_number':      b.purchase_number,
                'vendor_name':          b.vendor.name if b.vendor else '—',
                'is_paid':              b.is_paid,
                'date':                 b.date,
                'total_purchase_price': round(bill_taxable, 2),
                'total_tax':            round(bill_tax, 2),
                'round_off':            round(round_off, 2),
                'total_value':          round(bill_total, 2),
                'item_count':           b.items.count(),
            })
        return Response({'bills': result, 'grand_total': round(grand_total, 2)})

    @action(detail=False, methods=['get'])
    def purchase_tax_report(self, request):
        """
        Purchase tax report — item-level, mirrors sales_tax_report structure.
        - Taxable amount = qty × purchase_price (per item, base price excl. tax)
        - CGST = SGST = tax% / 2 applied on taxable amount
        - Deducts purchase returns for matching products in the same date range
        - Supports tax_rate filter
        """
        date_from  = request.query_params.get('date_from')
        date_to    = request.query_params.get('date_to')
        tax_filter = request.query_params.get('tax_rate')

        # Build purchase-return deduction map (confirmed returns only)
        pr_qs = PurchaseReturn.objects.filter(status='returned')
        if date_from: pr_qs = pr_qs.filter(date__date__gte=date_from)
        if date_to:   pr_qs = pr_qs.filter(date__date__lte=date_to)

        pr_map = {}
        for pr in pr_qs.select_related('product'):
            pid = pr.product_id
            if pid not in pr_map:
                pr_map[pid] = []
            pr_map[pid].append({
                'qty':   float(pr.quantity),
                'price': float(pr.purchase_price),
                'tax':   float(pr.tax),
            })

        qs = Purchase.objects.select_related('product', 'bill__vendor').order_by('bill__date')
        if date_from: qs = qs.filter(bill__date__date__gte=date_from)
        if date_to:   qs = qs.filter(bill__date__date__lte=date_to)

        items_data    = []
        grand_taxable = 0
        grand_cgst    = 0
        grand_sgst    = 0
        grand_tax     = 0
        grand_total   = 0
        all_tax_rates = set()
        pr_consumed   = {}

        for item in qs:
            tax_rate = float(item.tax or 0)
            all_tax_rates.add(tax_rate)

            if tax_rate == 0:
                continue

            if item.purchase_unit == 'case':
                selling_qty = float(item.selling_qty) if float(item.selling_qty) > 0 else 1
                qty   = float(item.quantity) * selling_qty
                price = float(item.purchase_price) / selling_qty
            else:
                qty   = float(item.quantity)
                price = float(item.purchase_price)
            pid = item.product_id

            # Deduct purchase returns FIFO
            if pid in pr_map and pr_map[pid]:
                if pid not in pr_consumed:
                    pr_consumed[pid] = {'idx': 0, 'used': 0.0}
                state    = pr_consumed[pid]
                deducted = 0.0

                while state['idx'] < len(pr_map[pid]) and deducted < qty:
                    ret   = pr_map[pid][state['idx']]
                    avail = ret['qty'] - state['used']
                    if avail <= 0:
                        state['idx'] += 1
                        state['used'] = 0.0
                        continue
                    take = min(avail, qty - deducted)
                    deducted      += take
                    state['used'] += take
                    if state['used'] >= ret['qty']:
                        state['idx'] += 1
                        state['used'] = 0.0

                qty = max(0.0, qty - deducted)

            if qty <= 0:
                continue

            if tax_filter:
                try:
                    if abs(tax_rate - float(tax_filter)) > 0.001:
                        continue
                except ValueError:
                    pass

            taxable  = qty * price
            item_tax = taxable * tax_rate / 100
            cgst_amt = item_tax / 2
            sgst_amt = item_tax / 2
            total    = taxable + item_tax

            grand_taxable += taxable
            grand_cgst    += cgst_amt
            grand_sgst    += sgst_amt
            grand_tax     += item_tax
            grand_total   += total

            items_data.append({
                'purchase_number': item.bill.purchase_number,
                'vendor_name':     item.bill.vendor.name if item.bill.vendor else '—',
                'date':            item.bill.date,
                'product_name':    item.product.name,
                'product_barcode': item.product.barcode,
                'quantity':        round(qty, 3),
                'purchase_price':  round(price, 4),
                'tax_rate':        tax_rate,
                'cgst_rate':       tax_rate / 2,
                'sgst_rate':       tax_rate / 2,
                'taxable_amount':  round(taxable, 2),
                'cgst':            round(cgst_amt, 2),
                'sgst':            round(sgst_amt, 2),
                'total_tax':       round(item_tax, 2),
                'total_amount':    round(total, 2),
                'is_paid':         item.bill.is_paid,
            })

        return Response({
            'bills':               items_data,
            'grand_taxable':       round(grand_taxable, 2),
            'grand_cgst':          round(grand_cgst, 2),
            'grand_sgst':          round(grand_sgst, 2),
            'grand_tax':           round(grand_tax, 2),
            'grand_total':         round(grand_total, 2),
            'available_tax_rates': sorted(all_tax_rates),
        })


class SaleBillViewSet(viewsets.ModelViewSet):
    queryset           = SaleBill.objects.none()  
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs        = SaleBill.objects.all().order_by('-created_at')
        date_from = self.request.query_params.get('date_from')
        date_to   = self.request.query_params.get('date_to')
        if date_from: qs = qs.filter(created_at__date__gte=date_from)
        if date_to:   qs = qs.filter(created_at__date__lte=date_to)
        return qs

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
        from django.db import transaction as db_transaction
        bill = self.get_object()
        with db_transaction.atomic():
            for item in bill.items.all():
                product = Product.objects.select_for_update().get(pk=item.product.pk)
                qty     = Decimal(str(item.quantity))
                if item.batch:
                    batch = StockBatch.objects.select_for_update().get(pk=item.batch.pk)
                    batch.quantity = Decimal(str(batch.quantity)) + qty
                    batch.save()
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

        ir_qs = ItemReturn.objects.all()
        if date_from: ir_qs = ir_qs.filter(date__date__gte=date_from)
        if date_to:   ir_qs = ir_qs.filter(date__date__lte=date_to)
        ir_total  = float(ir_qs.aggregate(t=Sum('total_amount'))['t'] or 0)
        ir_cash   = float(ir_qs.filter(payment_type='cash').aggregate(t=Sum('total_amount'))['t'] or 0)
        ir_cash  += float(ir_qs.filter(payment_type__in=['cash_card','cash_upi']).aggregate(t=Sum('cash_amount'))['t'] or 0)
        ir_card   = float(ir_qs.filter(payment_type='card').aggregate(t=Sum('total_amount'))['t'] or 0)
        ir_card  += float(ir_qs.filter(payment_type='cash_card').aggregate(t=Sum('card_amount'))['t'] or 0)
        ir_upi    = float(ir_qs.filter(payment_type='upi').aggregate(t=Sum('total_amount'))['t'] or 0)
        ir_upi   += float(ir_qs.filter(payment_type='cash_upi').aggregate(t=Sum('upi_amount'))['t'] or 0)

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
                'grand_total': grand_total,
                'cash_total':  cash_total,
                'card_total':  card_total,
                'upi_total':   upi_total,
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

        # Build return map: {(product_id, price): returned_qty} — customer returns only
        ret_qs = ItemReturnLine.objects.filter(return_type='customer_return')
        if date_from: ret_qs = ret_qs.filter(item_return__date__date__gte=date_from)
        if date_to:   ret_qs = ret_qs.filter(item_return__date__date__lte=date_to)
        ret_map = {}
        for rl in ret_qs.values('product_id', 'price').annotate(ret_qty=Sum('quantity')):
            ret_map[(rl['product_id'], rl['price'])] = Decimal(str(rl['ret_qty']))

        result = []
        for r in report:
            sold_qty = Decimal(str(r['total_qty']))
            price    = Decimal(str(r['price']))
            ret_qty  = ret_map.get((r['product__id'], r['price']), Decimal('0'))
            net_qty  = max(sold_qty - ret_qty, Decimal('0'))
            if net_qty <= 0:
                continue
            result.append({
                'product_id':        r['product__id'],
                'product_name':      r['product__name'],
                'product_barcode':   r['product__barcode'],
                'mrp':               r['price'],
                'quantity_sold':     float(net_qty),
                'returned_quantity': float(ret_qty),
                'total_amount':      round(float(price * net_qty), 2),
            })
        return Response(result)

    @action(detail=False, methods=['get'])
    def sales_tax_report(self, request):
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

            if tax_rate == 0:
                all_tax_rates.add(0.0)
                continue

            qty         = float(item.quantity)
            price       = float(item.price)
            total       = price * qty
            taxable_amt = total / (1 + tax_rate / 100)
            item_tax    = total - taxable_amt
            cgst_amt    = item_tax / 2
            sgst_amt    = item_tax / 2
            cgst_rate   = tax_rate / 2
            sgst_rate   = tax_rate / 2

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

        # Deduct customer returns from sales tax totals
        ret_qs = ItemReturnLine.objects.filter(return_type='customer_return').select_related('product')
        if date_from: ret_qs = ret_qs.filter(item_return__date__date__gte=date_from)
        if date_to:   ret_qs = ret_qs.filter(item_return__date__date__lte=date_to)
        ret_taxable = 0
        ret_cgst    = 0
        ret_sgst    = 0
        ret_tax     = 0
        for rl in ret_qs:
            tax_rate = float(rl.product.tax or 0)
            if tax_rate == 0:
                continue
            if tax_filter:
                try:
                    if abs(tax_rate - float(tax_filter)) > 0.001:
                        continue
                except ValueError:
                    pass
            total        = float(rl.quantity) * float(rl.price)
            taxable_amt  = total / (1 + tax_rate / 100)
            item_tax     = total - taxable_amt
            ret_taxable += taxable_amt
            ret_cgst    += item_tax / 2
            ret_sgst    += item_tax / 2
            ret_tax     += item_tax

        return Response({
            'items':               items_data,
            'grand_taxable':       round(grand_taxable - ret_taxable, 2),
            'grand_cgst':          round(grand_cgst    - ret_cgst,    2),
            'grand_sgst':          round(grand_sgst    - ret_sgst,    2),
            'grand_tax':           round(grand_total_tax - ret_tax,   2),
            'return_taxable':      round(ret_taxable, 2),
            'return_cgst':         round(ret_cgst,    2),
            'return_sgst':         round(ret_sgst,    2),
            'return_tax':          round(ret_tax,     2),
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
            'product_id':       r['product__id'],
            'product_name':     r['product__name'],
            'product_barcode':  r['product__barcode'],
            'destination_id':   r['destination__id'],
            'destination_name': r['destination__name'],
            'mrp':              r['price'],
            'quantity':         r['total_qty'],
            'total_amount':     float(r['price']) * float(r['total_qty']),
        } for r in report])


class PurchaseReturnViewSet(viewsets.ModelViewSet):
    queryset           = PurchaseReturn.objects.all().order_by('-date')
    serializer_class   = PurchaseReturnSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        product     = serializer.validated_data.get('product')
        vendor      = serializer.validated_data.get('vendor')
        given_price = serializer.validated_data.get('purchase_price')
        given_tax   = serializer.validated_data.get('tax')

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
            'returns':       result,
            'total_cost':    sum(r['item_cost'] for r in result),
            'pending_count': pending_count,
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


    @action(detail=True, methods=['patch'])
    def edit_payment(self, request, pk=None):
        sale         = self.get_object()
        payment_type = request.data.get('payment_type')
        cash_amount  = float(request.data.get('cash_amount', 0))
        card_amount  = float(request.data.get('card_amount', 0))
        upi_amount   = float(request.data.get('upi_amount',  0))
        if payment_type not in ['cash', 'card', 'upi', 'cash_card', 'cash_upi']:
            return Response({'error': 'Invalid payment type.'}, status=400)
        sale.payment_type = payment_type
        sale.cash_amount  = cash_amount
        sale.card_amount  = card_amount
        sale.upi_amount   = upi_amount
        sale.save()
        return Response(DirectSaleSerializer(sale).data)
    
    def destroy(self, request, *args, **kwargs):
        sale = self.get_object()
        sale.delete()
        return Response({'message': 'Direct sale deleted'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def report(self, request):
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        sales = DirectSale.objects.all().select_related('item', 'created_by')
        if date_from: sales = sales.filter(date__date__gte=date_from)
        if date_to:   sales = sales.filter(date__date__lte=date_to)
        sales = sales.order_by('-date')
        result      = []
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
        from django.db import transaction as db_transaction

        with db_transaction.atomic():
            adj = self.get_object()
            if adj.status != 'pending':
                return Response({'error': 'Already reviewed'}, status=400)
            product   = adj.product
            new_qty   = Decimal(str(adj.physical_stock))
            batches   = list(StockBatch.objects.filter(product=product))
            old_total = sum(Decimal(str(b.quantity)) for b in batches) or Decimal('0')

            if old_total > 0:
                ratio   = new_qty / old_total
                running = Decimal('0')
                for i, b in enumerate(batches):
                    if i == len(batches) - 1:
                        b.quantity = new_qty - running  # absorb rounding remainder
                    else:
                        b.quantity = (Decimal(str(b.quantity)) * ratio).quantize(Decimal('0.001'))
                        running += b.quantity
                    b.save()
            elif new_qty > 0:
                StockBatch.objects.create(product=product, mrp=product.selling_price, quantity=new_qty)
            else:
                StockBatch.objects.filter(product=product).update(quantity=Decimal('0'))

            product.stock_quantity = new_qty
            product.save()
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
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        """Export full database as JSON including all KC models and users."""

        def serialize_qs(qs):
            rows = []
            for obj in qs:
                row = {}
                for field in obj._meta.fields:
                    attr = field.attname
                    val  = getattr(obj, attr)
                    if isinstance(val, Decimal):
                        val = str(val)
                    elif hasattr(val, 'isoformat'):
                        val = val.isoformat()
                    row[attr] = val
                rows.append(row)
            return rows

        # FIX Issue 2: Include users in backup (without passwords)
        user_rows = []
        for u in User.objects.all():
            user_rows.append({
                'id':         u.id,
                'username':   u.username,
                'role':       u.role,
                'is_active':  u.is_active,
                'is_staff':   u.is_staff,
                'created_at': u.created_at.isoformat() if u.created_at else None,
            })

        # FIX Issue 2: Include user permissions in backup
        perm_rows = []
        for p in UserPermission.objects.all():
            row = {'id': p.id, 'user_id': p.user_id}
            for field in p._meta.fields:
                if field.name not in ('id', 'user'):
                    row[field.name] = getattr(p, field.name)
            perm_rows.append(row)

        # FIX Issue 1: Import KC models
        from .kc_models import (
            KCSaleItem, KCSaleSubItem, KCBill, KCBillLine,
            KCPurchase, KCPurchaseLine, KCStock, KCStockLine,
            KCStoreItem, KCStoreIssue, KCStoreIssueLine, KCClosingStock,
        )

        data = {
            'version':    2,
            'exported_at': timezone.now().isoformat(),

            # Users
            'users':             user_rows,
            'user_permissions':  perm_rows,

            # Main POS data
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

            # FIX Issue 1: Kaapi Chai data
            'kc_sale_items':         serialize_qs(KCSaleItem.objects.all()),
            'kc_sale_sub_items':     serialize_qs(KCSaleSubItem.objects.all()),
            'kc_bills':              serialize_qs(KCBill.objects.all()),
            'kc_bill_lines':         serialize_qs(KCBillLine.objects.all()),
            'kc_purchases':          serialize_qs(KCPurchase.objects.all()),
            'kc_purchase_lines':     serialize_qs(KCPurchaseLine.objects.all()),
            'kc_stocks':             serialize_qs(KCStock.objects.all()),
            'kc_stock_lines':        serialize_qs(KCStockLine.objects.all()),
            'kc_store_items':        serialize_qs(KCStoreItem.objects.all()),
            'kc_store_issues':       serialize_qs(KCStoreIssue.objects.all()),
            'kc_store_issue_lines':  serialize_qs(KCStoreIssueLine.objects.all()),
            'kc_closing_stocks':     serialize_qs(KCClosingStock.objects.all()),
        }

        from django.http import JsonResponse
        response = JsonResponse(data)
        filename = f"bakesale_backup_{timezone.now().strftime('%d-%m-%y_%I-%M%p')}.json"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    def post(self, request):
        """
        Restore database from uploaded JSON backup.
        Supports both version 1 and version 2 backups.
        """
        # Require confirmation phrase to prevent accidental wipes
        confirm = request.data.get('confirm') or request.FILES.get('confirm')
        if hasattr(confirm, 'read'):
            confirm = confirm.read().decode('utf-8').strip()
        if str(confirm) != 'RESTORE_CONFIRMED':
            return Response({
                'detail': 'Missing confirmation. Pass confirm="RESTORE_CONFIRMED" to proceed.'
            }, status=400)

        try:
            if request.FILES.get('file'):
                upload = request.FILES['file']
                if upload.size > 50 * 1024 * 1024:
                    return Response({'detail': 'Backup file too large (max 50MB)'}, status=400)
                raw  = upload.read()
                data = json.loads(raw)
            else:
                data = request.data
                import sys
                if sys.getsizeof(str(data)) > 50 * 1024 * 1024:
                    return Response({'detail': 'Data too large (max 50MB)'}, status=400)

            # FIX Issue 6: Support both version 1 and version 2
            version = data.get('version')
            if version not in (1, 2):
                return Response({'detail': 'Invalid or unsupported backup format'}, status=400)

            # FIX Issue 1: Import KC models
            from .kc_models import (
                KCSaleItem, KCSaleSubItem, KCBill, KCBillLine,
                KCPurchase, KCPurchaseLine, KCStock, KCStockLine,
                KCStoreItem, KCStoreIssue, KCStoreIssueLine, KCClosingStock,
            )

            from django.db import transaction as db_transaction
            with db_transaction.atomic():

                # ── Delete KC data first (references User) ──────────────────
                KCClosingStock.objects.all().delete()
                KCStoreIssueLine.objects.all().delete()
                KCStoreIssue.objects.all().delete()
                KCStockLine.objects.all().delete()
                KCStock.objects.all().delete()
                KCPurchaseLine.objects.all().delete()
                KCPurchase.objects.all().delete()
                KCBillLine.objects.all().delete()
                KCBill.objects.all().delete()
                KCSaleSubItem.objects.all().delete()
                KCSaleItem.objects.all().delete()
                KCStoreItem.objects.all().delete()

                # ── Delete main POS data (reverse dependency order) ──────────
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

                # FIX Issue 2: Delete user permissions and non-admin users
                UserPermission.objects.all().delete()
                # Keep current admin user, restore others
                current_user_id = request.user.id
                User.objects.exclude(id=current_user_id).delete()

                # ── Helpers ──────────────────────────────────────────────────
                def d(v):
                    return Decimal(str(v)) if v is not None else None

                from django.utils.dateparse import parse_datetime
                def dt(v):
                    if not v:
                        return None
                    parsed = parse_datetime(str(v))
                    if parsed and parsed.tzinfo is None:
                        from django.utils import timezone as tz
                        parsed = tz.make_aware(parsed)
                    return parsed

                # ── FIX Issue 2: Restore users ───────────────────────────────
                # Keep a map of old_id -> new_id for users
                # since current admin may have a different id than backup
                user_id_map = {current_user_id: current_user_id}

                for r in data.get('users', []):
                    # Skip if this is the current logged-in admin
                    if r['id'] == current_user_id:
                        continue
                    # Skip if username already exists (current admin)
                    if User.objects.filter(username=r['username']).exists():
                        existing = User.objects.get(username=r['username'])
                        user_id_map[r['id']] = existing.id
                        continue
                    # Restore user without password (they'll need to reset)
                    user = User(
                        id=r['id'],
                        username=r['username'],
                        role=r.get('role', 'general'),
                        is_active=r.get('is_active', True),
                        is_staff=r.get('is_staff', False),
                    )
                    user.set_unusable_password()
                    user.save()
                    user_id_map[r['id']] = r['id']

                # ── Restore user permissions ─────────────────────────────────
                for r in data.get('user_permissions', []):
                    user_id = user_id_map.get(r.get('user_id'))
                    if not user_id:
                        continue
                    try:
                        user_obj = User.objects.get(id=user_id)
                    except User.DoesNotExist:
                        continue
                    perm_data = {k: v for k, v in r.items() if k not in ('id', 'user_id')}
                    UserPermission.objects.create(user=user_obj, **perm_data)

                # ── Restore vendors ──────────────────────────────────────────
                for r in data.get('vendors', []):
                    Vendor.objects.create(
                        id=r['id'], name=r['name'],
                        phone=r.get('phone'), is_active=r.get('is_active', True),
                    )

                # ── Restore products ─────────────────────────────────────────
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

                # ── Restore stock batches ────────────────────────────────────
                for r in data.get('stock_batches', []):
                    StockBatch.objects.create(
                        id=r['id'], product_id=r['product_id'],
                        mrp=d(r['mrp']), quantity=d(r.get('quantity', 0)),
                    )

                # ── Restore purchase bills ───────────────────────────────────
                for r in data.get('purchase_bills', []):
                    obj = PurchaseBill.objects.create(
                        id=r['id'], purchase_number=r['purchase_number'],
                        vendor_id=r.get('vendor_id'), is_paid=r.get('is_paid', True),
                        created_by_id=None,
                    )
                    if r.get('date'):
                        PurchaseBill.objects.filter(pk=obj.pk).update(date=dt(r['date']))

                # ── Restore purchases ────────────────────────────────────────
                for r in data.get('purchases', []):
                    obj = Purchase.objects.create(
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
                    if r.get('date'):
                        Purchase.objects.filter(pk=obj.pk).update(date=dt(r['date']))

                # ── Restore sale bills ───────────────────────────────────────
                for r in data.get('sale_bills', []):
                    obj = SaleBill.objects.create(
                        id=r['id'], bill_number=r['bill_number'],
                        total_amount=d(r['total_amount']),
                        payment_type=r['payment_type'],
                        cash_amount=d(r.get('cash_amount', 0)),
                        card_amount=d(r.get('card_amount', 0)),
                        upi_amount=d(r.get('upi_amount', 0)),
                        created_by_id=None,
                    )
                    if r.get('created_at'):
                        SaleBill.objects.filter(pk=obj.pk).update(created_at=dt(r['created_at']))

                # ── Restore sale items ───────────────────────────────────────
                for r in data.get('sale_items', []):
                    SaleItem.objects.create(
                        id=r['id'], bill_id=r['bill_id'],
                        product_id=r['product_id'],
                        batch_id=r.get('batch_id'),
                        quantity=d(r['quantity']),
                        price=d(r['price']),
                        tax=d(r.get('tax', 0)),
                    )

                # ── Restore return items ─────────────────────────────────────
                for r in data.get('return_items', []):
                    obj = ReturnItem.objects.create(
                        id=r['id'], product_id=r['product_id'],
                        return_type=r['return_type'],
                        quantity=d(r.get('quantity', 1)),
                        processed_by_id=None,
                    )
                    if r.get('date'):
                        ReturnItem.objects.filter(pk=obj.pk).update(date=dt(r['date']))

                # ── Restore internal masters ─────────────────────────────────
                for r in data.get('internal_masters', []):
                    InternalSaleMaster.objects.create(
                        id=r['id'], name=r['name'],
                        is_active=r.get('is_active', True),
                        created_by_id=None,
                    )

                # ── Restore internal sale bills ──────────────────────────────
                for r in data.get('internal_sale_bills', []):
                    obj = InternalSaleBill.objects.create(
                        id=r['id'],
                        destination_id=r['destination_id'],
                        sale_number=r.get('sale_number', ''),
                        created_by_id=None,
                    )
                    if r.get('date'):
                        InternalSaleBill.objects.filter(pk=obj.pk).update(date=dt(r['date']))

                # ── Restore internal sales ───────────────────────────────────
                for r in data.get('internal_sales', []):
                    obj = InternalSale.objects.create(
                        id=r['id'], product_id=r['product_id'],
                        destination_id=r['destination_id'],
                        bill_id=r.get('bill_id'),
                        quantity=d(r['quantity']),
                        price=d(r['price']),
                        created_by_id=None,
                    )
                    if r.get('date'):
                        InternalSale.objects.filter(pk=obj.pk).update(date=dt(r['date']))

                # ── Restore purchase returns ─────────────────────────────────
                for r in data.get('purchase_returns', []):
                    obj = PurchaseReturn.objects.create(
                        id=r['id'], product_id=r['product_id'],
                        vendor_id=r.get('vendor_id'),
                        quantity=d(r['quantity']),
                        purchase_price=d(r.get('purchase_price', 0)),
                        tax=d(r.get('tax', 0)),
                        reason=r.get('reason', ''),
                        status=r.get('status', 'pending'),
                        created_by_id=None,
                    )
                    if r.get('date'):
                        PurchaseReturn.objects.filter(pk=obj.pk).update(date=dt(r['date']))

                # ── Restore direct masters ───────────────────────────────────
                for r in data.get('direct_masters', []):
                    DirectSaleMaster.objects.create(
                        id=r['id'], name=r['name'],
                        is_active=r.get('is_active', True),
                        created_by_id=None,
                    )

                # ── Restore direct sales ─────────────────────────────────────
                for r in data.get('direct_sales', []):
                    obj = DirectSale.objects.create(
                        id=r['id'], item_id=r['item_id'],
                        price=d(r['price']),
                        payment_type=r['payment_type'],
                        cash_amount=d(r.get('cash_amount', 0)),
                        card_amount=d(r.get('card_amount', 0)),
                        upi_amount=d(r.get('upi_amount', 0)),
                        created_by_id=None,
                    )
                    if r.get('date'):
                        DirectSale.objects.filter(pk=obj.pk).update(date=dt(r['date']))

                # ── Restore stock transfers ──────────────────────────────────
                for r in data.get('stock_transfers', []):
                    obj = StockTransfer.objects.create(
                        id=r['id'], product_id=r['product_id'],
                        quantity=d(r['quantity']),
                        mrp=d(r['mrp']),
                        purchase_price=d(r.get('purchase_price', 0)),
                        tax=d(r.get('tax', 0)),
                        created_by_id=None,
                    )
                    if r.get('date'):
                        StockTransfer.objects.filter(pk=obj.pk).update(date=dt(r['date']))

                # ── Restore item returns ─────────────────────────────────────
                for r in data.get('item_returns', []):
                    obj = ItemReturn.objects.create(
                        id=r['id'],
                        return_number=r.get('return_number', ''),
                        payment_type=r.get('payment_type', 'cash'),
                        cash_amount=d(r.get('cash_amount', 0)),
                        card_amount=d(r.get('card_amount', 0)),
                        upi_amount=d(r.get('upi_amount', 0)),
                        total_amount=d(r.get('total_amount', 0)),
                        created_by_id=None,
                    )
                    if r.get('date'):
                        ItemReturn.objects.filter(pk=obj.pk).update(date=dt(r['date']))

                # ── Restore item return lines ────────────────────────────────
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

                # ── Restore physical stock requests ──────────────────────────
                for r in data.get('physical_stock_reqs', []):
                    obj = PhysicalStockRequest.objects.create(
                        id=r['id'],
                        request_number=r.get('request_number', ''),
                        status=r.get('status', 'pending'),
                        reason=r.get('reason', ''),
                        requested_by_id=None,
                        reviewed_by_id=None,
                    )
                    if r.get('created_at'):
                        PhysicalStockRequest.objects.filter(pk=obj.pk).update(
                            created_at=dt(r['created_at']))

                # ── Restore stock adjustments ────────────────────────────────
                for r in data.get('stock_adjustments', []):
                    obj = StockAdjustmentRequest.objects.create(
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
                    if r.get('created_at'):
                        StockAdjustmentRequest.objects.filter(pk=obj.pk).update(
                            created_at=dt(r['created_at']))

                # ── FIX Issue 1: Restore Kaapi Chai data ────────────────────

                for r in data.get('kc_store_items', []):
                    KCStoreItem.objects.create(
                        id=r['id'], name=r['name'],
                        unit=r.get('unit', 'kg'),
                        is_active=r.get('is_active', True),
                    )

                for r in data.get('kc_sale_items', []):
                    KCSaleItem.objects.create(
                        id=r['id'], name=r['name'],
                        item_type=r.get('item_type', 'direct'),
                        price=d(r.get('price', 0)),
                        is_active=r.get('is_active', True),
                        purchase_required=r.get('purchase_required', False),
                    )

                for r in data.get('kc_sale_sub_items', []):
                    KCSaleSubItem.objects.create(
                        id=r['id'], parent_id=r['parent_id'],
                        name=r['name'], price=d(r['price']),
                    )

                for r in data.get('kc_purchases', []):
                    obj = KCPurchase.objects.create(
                        id=r['id'],
                        purchase_number=r.get('purchase_number', ''),
                        group_id=r.get('group_id'),
                        group_name=r.get('group_name', ''),
                        total=d(r.get('total', 0)),
                        created_by_id=None,
                    )
                    if r.get('created_at'):
                        KCPurchase.objects.filter(pk=obj.pk).update(created_at=dt(r['created_at']))

                for r in data.get('kc_purchase_lines', []):
                    KCPurchaseLine.objects.create(
                        id=r['id'], purchase_id=r['purchase_id'],
                        item_id=r.get('item_id'),
                        item_name=r.get('item_name', ''),
                        qty=d(r['qty']),
                        cost=d(r.get('cost', 0)),
                    )

                for r in data.get('kc_bills', []):
                    obj = KCBill.objects.create(
                        id=r['id'],
                        bill_number=r.get('bill_number', ''),
                        total=d(r['total']),
                        payment_type=r.get('payment_type', 'cash'),
                        cash_amount=d(r.get('cash_amount', 0)),
                        card_amount=d(r.get('card_amount', 0)),
                        upi_amount=d(r.get('upi_amount', 0)),
                        created_by_id=None,
                    )
                    if r.get('created_at'):
                        KCBill.objects.filter(pk=obj.pk).update(created_at=dt(r['created_at']))

                for r in data.get('kc_bill_lines', []):
                    KCBillLine.objects.create(
                        id=r['id'], bill_id=r['bill_id'],
                        item_id=r.get('item_id'),
                        item_name=r.get('item_name', ''),
                        qty=d(r['qty']),
                        price=d(r['price']),
                    )

                for r in data.get('kc_stocks', []):
                    obj = KCStock.objects.create(
                        id=r['id'],
                        stock_number=r.get('stock_number', ''),
                        created_by_id=None,
                    )
                    if r.get('created_at'):
                        KCStock.objects.filter(pk=obj.pk).update(created_at=dt(r['created_at']))

                for r in data.get('kc_stock_lines', []):
                    KCStockLine.objects.create(
                        id=r['id'], stock_id=r['stock_id'],
                        item_id=r.get('item_id'),
                        item_name=r.get('item_name', ''),
                        qty=d(r['qty']),
                        carry_forward=r.get('carry_forward', False),
                    )

                for r in data.get('kc_store_issues', []):
                    obj = KCStoreIssue.objects.create(
                        id=r['id'],
                        issue_number=r.get('issue_number', ''),
                        total=d(r.get('total', 0)),
                        created_by_id=None,
                    )
                    if r.get('created_at'):
                        KCStoreIssue.objects.filter(pk=obj.pk).update(created_at=dt(r['created_at']))

                for r in data.get('kc_store_issue_lines', []):
                    KCStoreIssueLine.objects.create(
                        id=r['id'], issue_id=r['issue_id'],
                        item_id=r.get('item_id'),
                        item_name=r.get('item_name', ''),
                        unit=r.get('unit', 'kg'),
                        qty=d(r['qty']),
                        cost=d(r.get('cost', 0)),
                    )

                for r in data.get('kc_closing_stocks', []):
                    KCClosingStock.objects.create(
                        id=r['id'], item_id=r['item_id'],
                        qty=d(r['qty']),
                        cost_per_unit=d(r.get('cost_per_unit', 0)),
                        updated_by_id=None,
                    )

            # ── Reset PostgreSQL sequences ────────────────────────────────────
            from django.db import connection
            tables_with_sequences = [
                ('api_user',                  'id'),
                ('api_vendor',                'id'),
                ('api_product',               'id'),
                ('api_stockbatch',            'id'),
                ('api_purchasebill',          'id'),
                ('api_purchase',              'id'),
                ('api_salebill',              'id'),
                ('api_saleitem',              'id'),
                ('api_returnitem',            'id'),
                ('api_internalsalemaster',    'id'),
                ('api_internalsalebill',      'id'),
                ('api_internalsale',          'id'),
                ('api_purchasereturn',        'id'),
                ('api_directsalemaster',      'id'),
                ('api_directsale',            'id'),
                ('api_stocktransfer',         'id'),
                ('api_itemreturn',            'id'),
                ('api_itemreturnline',        'id'),
                ('api_physicalstockrequest',  'id'),
                ('api_stockadjustmentrequest','id'),
                ('api_kcsaleitem',            'id'),
                ('api_kcsalesubitem',         'id'),
                ('api_kcbill',                'id'),
                ('api_kcbillline',            'id'),
                ('api_kcpurchase',            'id'),
                ('api_kcpurchaseline',        'id'),
                ('api_kcstock',               'id'),
                ('api_kcstockline',           'id'),
                ('api_kcstoreitem',           'id'),
                ('api_kcstoreissue',          'id'),
                ('api_kcstoreissueline',      'id'),
                ('api_kcclosingstock',        'id'),
            ]
            with connection.cursor() as cursor:
                for table, col in tables_with_sequences:
                    cursor.execute(
                        f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), "
                        f"COALESCE((SELECT MAX({col}) FROM {table}), 0) + 1, false)"
                    )

            return Response({
                'detail': 'Backup restored successfully. Note: Restored users will need their passwords reset.'
            })

        except Exception as e:
            return Response({'detail': f'Restore failed: {str(e)}'}, status=400)

class UserPermissionViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def get_or_create_perm(self, user):
        perm, _ = UserPermission.objects.get_or_create(user=user)
        return perm

    @action(detail=False, methods=['get'], url_path='me')
    def my_permissions(self, request):
        if request.user.role == 'admin':
            return Response({'is_admin': True})
        perm = self.get_or_create_perm(request.user)
        return Response({'is_admin': False, **UserPermissionSerializer(perm).data})

    def list(self, request):
        # FIX: Use IsAdminUser permission class instead of manual role check
        if not request.user.role == 'admin':
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
        if not request.user.role == 'admin':
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
        from django.db import transaction as db_transaction
        data     = request.data
        lines    = data.get('lines', [])
        pay_type = data.get('payment_type', 'cash')
        cash_amt = Decimal(str(data.get('cash_amount', 0)))
        card_amt = Decimal(str(data.get('card_amount', 0)))
        upi_amt  = Decimal(str(data.get('upi_amount', 0)))

        if not lines:
            return Response({'error': 'No items provided'}, status=400)

        total = sum(
            Decimal(str(l['quantity'])) * Decimal(str(l['price']))
            for l in lines
            if l.get('return_type', 'customer_return') == 'customer_return'
        )

        # FIX: Wrap entire return creation in a transaction with locks
        with db_transaction.atomic():
            ir = ItemReturn.objects.create(
                payment_type=pay_type,
                cash_amount=cash_amt,
                card_amount=card_amt,
                upi_amount=upi_amt,
                total_amount=total,
                created_by=request.user,
            )

            for l in lines:
                # FIX: Lock product row to prevent concurrent stock corruption
                product   = Product.objects.select_for_update().get(id=l['product'])
                qty       = Decimal(str(l['quantity']))
                price     = Decimal(str(l['price']))
                rtype     = l.get('return_type', 'customer_return')
                bill_id   = l.get('sale_bill')
                sale_bill = None

                if bill_id:
                    try:
                        sale_bill = SaleBill.objects.get(id=bill_id)
                    except SaleBill.DoesNotExist:
                        pass

                if rtype == 'customer_return':
                    product.stock_quantity += qty
                    # Add stock back to the highest MRP batch
                    latest = StockBatch.objects.filter(product=product).order_by('-mrp', '-created_at').first()
                    if latest:
                        latest.quantity = Decimal(str(latest.quantity)) + qty
                        latest.save()
                    else:
                        StockBatch.objects.create(
                            product=product, mrp=product.selling_price, quantity=qty)
                elif rtype == 'damaged':
                    product.damaged_quantity += qty
                    product.stock_quantity = max(Decimal('0'), product.stock_quantity - qty)
                    remaining = qty
                    for b in StockBatch.objects.select_for_update().filter(
                        product=product, quantity__gt=0
                    ).order_by('-mrp'):
                        if remaining <= 0:
                            break
                        deduct = min(Decimal(str(b.quantity)), remaining)
                        b.quantity = Decimal(str(b.quantity)) - deduct
                        b.save()
                        remaining -= deduct
                elif rtype == 'expired':
                    product.expired_quantity += qty
                    product.stock_quantity = max(Decimal('0'), product.stock_quantity - qty)
                    remaining = qty
                    for b in StockBatch.objects.select_for_update().filter(
                        product=product, quantity__gt=0
                    ).order_by('mrp'):
                        if remaining <= 0:
                            break
                        deduct = min(Decimal(str(b.quantity)), remaining)
                        b.quantity = Decimal(str(b.quantity)) - deduct
                        b.save()
                        remaining -= deduct

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
                    'product_id':       l.product.id,
                    'product_name':     l.product.name,
                    'barcode':          l.product.barcode,
                    'quantity':         float(l.quantity),
                    'price':            float(l.price),
                    'total':            float(l.quantity * l.price),
                    'return_type':      l.return_type,
                    'sale_bill_id':     l.sale_bill.id if l.sale_bill else None,
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
        product_id = request.query_params.get('product_id')
        qty        = request.query_params.get('qty', 1)
        date_to    = request.query_params.get('date_to')

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

        if date_to:
            import datetime
            try:
                date_obj     = datetime.date.fromisoformat(date_to)
                start_of_day = timezone.make_aware(
                    datetime.datetime.combine(date_obj, datetime.time(0, 0, 0))
                )
                end_of_day = timezone.make_aware(
                    datetime.datetime.combine(date_obj, datetime.time(23, 59, 59, 999999))
                )
                sale_items = sale_items.filter(
                    bill__created_at__gte=start_of_day,
                    bill__created_at__lte=end_of_day
                )
            except ValueError:
                pass

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
        from django.db import transaction as db_transaction
        data       = request.data
        dest_id    = data.get('destination')
        items_data = data.get('items', [])

        if not dest_id or not items_data:
            return Response({'error': 'destination and items required'}, status=400)

        # FIX: Wrap in transaction with select_for_update to prevent concurrent stock issues
        with db_transaction.atomic():
            destination = InternalSaleMaster.objects.get(id=dest_id)
            bill = InternalSaleBill.objects.create(
                destination=destination,
                created_by=request.user,
            )

            for item in items_data:
                # FIX: Lock product row
                product = Product.objects.select_for_update().get(id=item['product'])
                qty     = Decimal(str(item['quantity']))
                price   = Decimal(str(item.get('price', product.selling_price)))

                if product.stock_quantity < qty:
                    raise Exception(f"Insufficient stock for {product.name}")

                InternalSale.objects.create(
                    bill=bill,
                    product=product,
                    destination=destination,
                    quantity=qty,
                    price=price,
                    created_by=request.user,
                )

                # Deduct from batches
                remaining = qty
                for b in StockBatch.objects.select_for_update().filter(
                    product=product, quantity__gt=0
                ).order_by('mrp', 'created_at'):
                    if remaining <= 0:
                        break
                    deduct = min(Decimal(str(b.quantity)), remaining)
                    b.quantity = Decimal(str(b.quantity)) - deduct
                    b.save()
                    remaining -= deduct

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
    serializer_class   = PhysicalStockRequestSerializer

    def list(self, request):
        qs = PhysicalStockRequest.objects.prefetch_related(
            'items__product', 'items__batch', 'requested_by', 'reviewed_by'
        ).order_by('-created_at')
        result = []
        for ps in qs:
            items = []
            for item in ps.items.all():
                items.append({
                    'id':              item.id,
                    'product_id':      item.product.id,
                    'product_name':    item.product.name,
                    'product_barcode': item.product.barcode,
                    'mrp':             float(item.product.selling_price),
                    'batch_id':        item.batch_id,
                    'batch_mrp':       float(item.batch.mrp) if item.batch_id else None,
                    'selling_unit':    item.product.selling_unit,
                    'system_stock':    float(item.system_stock),
                    'physical_stock':  float(item.physical_stock),
                    'status':          item.status,
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
        from django.db import transaction as db_transaction
        items_data = request.data.get('items', [])
        reason     = request.data.get('reason', '')
        if not items_data:
            return Response({'error': 'No items provided'}, status=400)
        with db_transaction.atomic():
            ps = PhysicalStockRequest.objects.create(
                reason=reason,
                requested_by=request.user,
            )
            for item in items_data:
                product  = Product.objects.get(pk=item['product'])
                batch_id = item.get('batch_id') or None
                batch    = None
                if batch_id:
                    try:
                        batch        = StockBatch.objects.get(pk=batch_id, product=product)
                        system_stock = batch.quantity
                    except StockBatch.DoesNotExist:
                        system_stock = product.stock_quantity
                else:
                    system_stock = product.stock_quantity
                StockAdjustmentRequest.objects.create(
                    ps_request=ps,
                    product=product,
                    batch=batch,
                    system_stock=system_stock,
                    physical_stock=item['physical_stock'],
                    reason=reason,
                    requested_by=request.user,
                )
        return Response({'id': ps.id, 'request_number': ps.request_number}, status=201)

    @action(detail=True, methods=['patch'])
    def approve(self, request, pk=None):
        from django.db import transaction as db_transaction
        from django.db.models import Sum as DSum

        with db_transaction.atomic():
            ps = PhysicalStockRequest.objects.select_for_update().get(pk=pk)
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

                product = item.product
                new_qty = Decimal(str(item.physical_stock))

                if item.batch_id:
                    # Batch-specific: only update the counted batch, then resum product total
                    item.batch.quantity = new_qty
                    item.batch.save()
                    product.stock_quantity = (
                        StockBatch.objects.filter(product=product)
                        .aggregate(t=DSum('quantity'))['t'] or Decimal('0')
                    )
                    product.save()
                else:
                    # Product-level: scale all batches proportionally
                    batches   = list(StockBatch.objects.filter(product=product))
                    old_total = sum(Decimal(str(b.quantity)) for b in batches) or Decimal('0')

                    if old_total > 0:
                        ratio   = new_qty / old_total
                        running = Decimal('0')
                        for i, b in enumerate(batches):
                            if i == len(batches) - 1:
                                b.quantity = new_qty - running  # absorb rounding remainder
                            else:
                                b.quantity = (Decimal(str(b.quantity)) * ratio).quantize(Decimal('0.001'))
                                running += b.quantity
                            b.save()
                    elif new_qty > 0:
                        existing = StockBatch.objects.filter(product=product).first()
                        if existing:
                            StockBatch.objects.filter(product=product).update(quantity=Decimal('0'))
                            existing.quantity = new_qty
                            existing.save()
                        else:
                            StockBatch.objects.create(
                                product=product,
                                mrp=product.selling_price,
                                quantity=new_qty,
                            )
                    else:
                        StockBatch.objects.filter(product=product).update(quantity=Decimal('0'))

                    product.stock_quantity = new_qty
                    product.save()

        return Response({'status': 'approved'})

    @action(detail=True, methods=['patch'])
    def reject(self, request, pk=None):
        from django.db import transaction as db_transaction

        with db_transaction.atomic():
            ps = PhysicalStockRequest.objects.select_for_update().get(pk=pk)
            if ps.status != 'pending':
                return Response({'error': 'Already processed'}, status=400)
            ps.status      = 'rejected'
            ps.reviewed_by = request.user
            ps.reviewed_at = timezone.now()
            ps.save()
            ps.items.all().update(
                status='rejected',
                reviewed_by=request.user,
                reviewed_at=timezone.now(),
            )
        return Response({'status': 'rejected'})


class SyncStockView(APIView):
    # FIX: Use IsAdminUser permission class consistently
    permission_classes = [IsAuthenticated, IsAdminUser]

    def post(self, request):
        """
        FIX: Added confirmation requirement to prevent accidental stock corruption.
        Pass confirm='SYNC_CONFIRMED' in the request body.
        """
        confirm = request.data.get('confirm')
        if confirm != 'SYNC_CONFIRMED':
            return Response({
                'detail': 'Pass confirm="SYNC_CONFIRMED" to proceed with stock sync.'
            }, status=400)

        from django.db.models import Sum as DSum
        fixed = []
        for product in Product.objects.prefetch_related('batches').all():
            batch_total = product.batches.filter(
                quantity__gt=0
            ).aggregate(t=DSum('quantity'))['t'] or Decimal('0')

            if abs(float(product.stock_quantity) - float(batch_total)) > 0.001:
                fixed.append({
                    'product': product.name,
                    'was':     float(product.stock_quantity),
                    'now':     float(batch_total),
                })
                product.stock_quantity = batch_total
                product.save()

        return Response({
            'fixed':   len(fixed),
            'details': fixed,
        })


# ── Profit & Loss Report ───────────────────────────────────────────────────────

class ProfitLossView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        import datetime as dt

        date_from_str = request.query_params.get('date_from')
        date_to_str   = request.query_params.get('date_to')

        def parse_date(s, end_of_day=False):
            if not s:
                return None
            d = dt.datetime.strptime(s, '%Y-%m-%d')
            if end_of_day:
                d = d.replace(hour=23, minute=59, second=59, microsecond=999999)
            return timezone.make_aware(d)

        date_from = parse_date(date_from_str)
        date_to   = parse_date(date_to_str, end_of_day=True)

        def date_filter(qs, field):
            if date_from: qs = qs.filter(**{f'{field}__gte': date_from})
            if date_to:   qs = qs.filter(**{f'{field}__lte': date_to})
            return qs

        # Average purchase cost for a product (fallback when batch has no cost)
        avg_cost_cache = {}
        def get_avg_cost(product_id):
            if product_id not in avg_cost_cache:
                rows = Purchase.objects.filter(product_id=product_id)
                tot_cost = sum(Decimal(str(r.purchase_price)) * Decimal(str(r.quantity)) for r in rows)
                tot_qty  = sum(Decimal(str(r.quantity)) for r in rows)
                avg_cost_cache[product_id] = (tot_cost / tot_qty).quantize(Decimal('0.01')) if tot_qty > 0 else Decimal('0')
            return avg_cost_cache[product_id]

        def get_cost_price(product_id, batch):
            if batch and Decimal(str(batch.purchase_price)) > 0:
                return Decimal(str(batch.purchase_price))
            return get_avg_cost(product_id)

        def ex_tax(price, tax_rate):
            """Convert tax-inclusive selling price to tax-exclusive (base) price."""
            t = Decimal(str(tax_rate))
            return price / (1 + t / 100) if t > 0 else price

        # ── 1. Gross Sales & COGS ────────────────────────────────────────────
        sale_items = list(
            date_filter(
                SaleItem.objects.select_related('batch', 'product'),
                'bill__created_at',
            )
        )
        gross_sales = Decimal('0')
        total_cogs  = Decimal('0')
        for si in sale_items:
            qty         = Decimal(str(si.quantity))
            gross_sales += qty * ex_tax(Decimal(str(si.price)), si.tax)
            total_cogs  += qty * get_cost_price(si.product_id, si.batch)

        # ── 2. Customer Returns (revenue & COGS both reversed) ──────────────
        cust_ret_lines = list(
            date_filter(
                ItemReturnLine.objects.filter(return_type='customer_return')
                    .select_related('item_return', 'product'),
                'item_return__date',
            )
        )
        cust_ret_revenue = Decimal('0')
        cust_ret_cogs    = Decimal('0')
        for r in cust_ret_lines:
            qty              = Decimal(str(r.quantity))
            cust_ret_revenue += qty * ex_tax(Decimal(str(r.price)), r.product.tax)
            cust_ret_cogs    += qty * get_avg_cost(r.product_id)

        # ── 3. Purchase Returns refund (reduces cost) ────────────────────────
        pur_ret_refund = sum(
            (Decimal(str(r.quantity)) * Decimal(str(r.purchase_price))
             for r in date_filter(PurchaseReturn.objects.filter(status='returned'), 'date')),
            Decimal('0'),
        )

        # ── 4. Damaged & Expired losses ──────────────────────────────────────
        def stock_loss_from_returns(return_type):
            lines = list(
                date_filter(
                    ItemReturnLine.objects.filter(return_type=return_type)
                        .select_related('item_return', 'product'),
                    'item_return__date',
                )
            )
            return sum(
                (Decimal(str(r.quantity)) * get_avg_cost(r.product_id) for r in lines),
                Decimal('0'),
            )

        damaged_loss = stock_loss_from_returns('damaged')
        expired_loss = stock_loss_from_returns('expired')

        # ── 5. Physical Stock Adjustments ────────────────────────────────────
        ps_items = list(
            date_filter(
                StockAdjustmentRequest.objects.filter(status='approved')
                    .select_related('product', 'batch'),
                'reviewed_at',
            )
        )
        ps_loss    = Decimal('0')
        ps_gain    = Decimal('0')
        ps_details = []
        for adj in ps_items:
            diff    = Decimal(str(adj.physical_stock)) - Decimal(str(adj.system_stock))
            cost_pp = get_cost_price(adj.product_id, adj.batch)
            value   = abs(diff) * cost_pp
            if diff < 0:
                ps_loss += value
                ps_details.append({'product': adj.product.name, 'diff': float(diff), 'cost_price': float(cost_pp), 'value': float(value), 'type': 'loss'})
            elif diff > 0:
                ps_gain += value
                ps_details.append({'product': adj.product.name, 'diff': float(diff), 'cost_price': float(cost_pp), 'value': float(value), 'type': 'gain'})

        # ── Final numbers ────────────────────────────────────────────────────
        net_revenue  = gross_sales    - cust_ret_revenue
        net_cogs     = total_cogs     - cust_ret_cogs - pur_ret_refund
        gross_profit = net_revenue    - net_cogs
        net_profit   = gross_profit   - damaged_loss - expired_loss - ps_loss + ps_gain

        def pct(num, denom):
            return round(float(num / denom * 100), 1) if denom > 0 else 0.0

        def f2(v):
            return float(v.quantize(Decimal('0.01')))

        return Response({
            'period': {'from': date_from_str, 'to': date_to_str},
            'revenue': {
                'gross_sales':      f2(gross_sales),
                'customer_returns': f2(cust_ret_revenue),
                'net_revenue':      f2(net_revenue),
            },
            'cost': {
                'total_cogs':              f2(total_cogs),
                'customer_returns_cogs':   f2(cust_ret_cogs),
                'purchase_returns_refund': f2(pur_ret_refund),
                'net_cogs':                f2(net_cogs),
            },
            'gross_profit':     f2(gross_profit),
            'gross_margin_pct': pct(gross_profit, net_revenue),
            'adjustments': {
                'damaged_loss':        f2(damaged_loss),
                'expired_loss':        f2(expired_loss),
                'physical_stock_loss': f2(ps_loss),
                'physical_stock_gain': f2(ps_gain),
            },
            'net_profit':     f2(net_profit),
            'net_margin_pct': pct(net_profit, net_revenue),
            'physical_stock_details': ps_details,
        })