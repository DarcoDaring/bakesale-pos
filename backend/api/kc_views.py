"""
Kaapi Chai POS — Django Views (with closing stock + payment mode)
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum
from django.utils import timezone
from decimal import Decimal
import datetime

from .models import (
    KCSaleItem, KCSaleSubItem, KCBill, KCBillLine,
    KCPurchase, KCPurchaseLine,
    KCStock, KCStockLine,
    KCStoreItem, KCStoreIssue, KCStoreIssueLine,
    KCClosingStock,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def serialize_sale_item(item):
    return {
        'id':                item.id,
        'name':              item.name,
        'item_type':         item.item_type,
        'price':             str(item.price),
        'is_active':         item.is_active,
        'purchase_required': item.purchase_required,
        'created_at':        item.created_at,
        'sub_items': [
            {'id': s.id, 'name': s.name, 'price': str(s.price)}
            for s in item.sub_items.all()
        ],
    }

def serialize_bill(bill):
    return {
        'id':           bill.id,
        'bill_number':  bill.bill_number,
        'total':        str(bill.total),
        'payment_type': bill.payment_type,
        'cash_amount':  str(bill.cash_amount),
        'card_amount':  str(bill.card_amount),
        'upi_amount':   str(bill.upi_amount),
        'created_at':   bill.created_at,
        'lines': [
            {'item_id': l.item_id, 'item_name': l.item_name,
             'qty': str(l.qty), 'price': str(l.price)}
            for l in bill.lines.all()
        ],
    }

def serialize_purchase(p):
    return {
        'id':              p.id,
        'purchase_number': p.purchase_number,
        'group_id':        p.group_id,
        'group_name':      p.group_name,
        'created_at':      p.created_at,
        'lines': [
            {'item_id': l.item_id, 'item_name': l.item_name, 'qty': str(l.qty)}
            for l in p.lines.all()
        ],
    }

def serialize_stock(s):
    return {
        'id':           s.id,
        'stock_number': s.stock_number,
        'created_at':   s.created_at,
        'lines': [
            {
                'item_id':       l.item_id,
                'item_name':     l.item_name,
                'qty':           str(l.qty),
                'carry_forward': l.carry_forward,
            }
            for l in s.lines.all()
        ],
    }

def serialize_issue(issue):
    return {
        'id':           issue.id,
        'issue_number': issue.issue_number,
        'total':        str(issue.total),
        'created_at':   issue.created_at,
        'lines': [
            {
                'item_id':   l.item_id,
                'item_name': l.item_name,
                'unit':      l.unit,
                'qty':       str(l.qty),
                'cost':      str(l.cost),
                'total':     str(l.qty * l.cost),
            }
            for l in issue.lines.all()
        ],
    }


# ── Core stock calculation ─────────────────────────────────────────────────────

def get_today_stock(for_date=None):
    if for_date is None:
        for_date = timezone.localdate()

    purchase_lines = KCPurchaseLine.objects.filter(purchase__created_at__date=for_date)
    purchased = {}
    for l in purchase_lines:
        key = l.item_id
        if key not in purchased:
            purchased[key] = {'item_id': key, 'item_name': l.item_name, 'qty': Decimal('0')}
        purchased[key]['qty'] += l.qty

    yesterday   = for_date - datetime.timedelta(days=1)
    carry_lines = KCStockLine.objects.filter(stock__created_at__date=yesterday, carry_forward=True)
    carried = {}
    for l in carry_lines:
        key = l.item_id
        if key not in carried:
            carried[key] = {'item_id': key, 'item_name': l.item_name, 'qty': Decimal('0')}
        carried[key]['qty'] += l.qty

    bill_lines = KCBillLine.objects.filter(bill__created_at__date=for_date)
    sold = {}
    for l in bill_lines:
        key = l.item_id
        if key not in sold:
            sold[key] = Decimal('0')
        sold[key] += l.qty

    all_item_ids = set(purchased.keys()) | set(carried.keys())
    result = {}
    for item_id in all_item_ids:
        p_qty     = purchased.get(item_id, {}).get('qty', Decimal('0'))
        c_qty     = carried.get(item_id, {}).get('qty', Decimal('0'))
        s_qty     = sold.get(item_id, Decimal('0'))
        name      = purchased.get(item_id, {}).get('item_name') or carried.get(item_id, {}).get('item_name', '')
        remaining = p_qty + c_qty - s_qty
        result[item_id] = {
            'item_id':       item_id,
            'item_name':     name,
            'purchased_qty': float(p_qty),
            'carried_qty':   float(c_qty),
            'sold_qty':      float(s_qty),
            'remaining_qty': float(max(remaining, Decimal('0'))),
        }
    return result


# ── Sale Item ViewSet ──────────────────────────────────────────────────────────

class KCSaleItemViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        items = KCSaleItem.objects.prefetch_related('sub_items').order_by('name')
        return Response([serialize_sale_item(i) for i in items])

    def create(self, request):
        data              = request.data
        name              = data.get('name', '').strip()
        item_type         = data.get('item_type', 'direct')
        price             = Decimal(str(data.get('price', 0)))
        is_active         = data.get('is_active', True)
        purchase_required = bool(data.get('purchase_required', False))
        if not name:
            return Response({'detail': 'Name required'}, status=400)
        if item_type == 'direct':
            purchase_required = False
        item = KCSaleItem.objects.create(
            name=name, item_type=item_type, price=price,
            is_active=is_active, purchase_required=purchase_required,
        )
        for s in data.get('sub_items', []):
            KCSaleSubItem.objects.create(parent=item, name=s['name'].strip(), price=Decimal(str(s['price'])))
        return Response(serialize_sale_item(item), status=201)

    def retrieve(self, request, pk=None):
        try:
            item = KCSaleItem.objects.prefetch_related('sub_items').get(pk=pk)
        except KCSaleItem.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        return Response(serialize_sale_item(item))

    def partial_update(self, request, pk=None):
        try:
            item = KCSaleItem.objects.prefetch_related('sub_items').get(pk=pk)
        except KCSaleItem.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        data = request.data
        if 'name'      in data: item.name      = data['name'].strip()
        if 'item_type' in data: item.item_type = data['item_type']
        if 'price'     in data: item.price     = Decimal(str(data['price']))
        if 'is_active' in data: item.is_active = data['is_active']
        if 'purchase_required' in data:
            item.purchase_required = bool(data['purchase_required']) if item.item_type == 'group' else False
        item.save()
        if 'sub_items' in data:
            item.sub_items.all().delete()
            for s in data['sub_items']:
                KCSaleSubItem.objects.create(parent=item, name=s['name'].strip(), price=Decimal(str(s['price'])))
        return Response(serialize_sale_item(item))

    def destroy(self, request, pk=None):
        try:
            KCSaleItem.objects.get(pk=pk).delete()
        except KCSaleItem.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        return Response(status=204)

    @action(detail=False, methods=['get'])
    def with_stock(self, request):
        today_stock = get_today_stock()
        items       = KCSaleItem.objects.filter(is_active=True).prefetch_related('sub_items').order_by('name')
        result      = []
        for item in items:
            if item.item_type == 'direct':
                d = serialize_sale_item(item)
                d['remaining_qty'] = None
                result.append(d)
            elif item.item_type == 'group':
                if not item.purchase_required:
                    sub_list = [{'id': si.id, 'name': si.name, 'price': str(si.price), 'remaining_qty': None} for si in item.sub_items.all()]
                    if sub_list:
                        d = serialize_sale_item(item)
                        d['sub_items']     = sub_list
                        d['remaining_qty'] = None
                        result.append(d)
                else:
                    sub_with_stock = []
                    for si in item.sub_items.all():
                        remaining = today_stock.get(si.id, {}).get('remaining_qty', 0)
                        if remaining > 0:
                            sub_with_stock.append({'id': si.id, 'name': si.name, 'price': str(si.price), 'remaining_qty': remaining})
                    if sub_with_stock:
                        d = serialize_sale_item(item)
                        d['sub_items']     = sub_with_stock
                        d['remaining_qty'] = sum(s['remaining_qty'] for s in sub_with_stock)
                        result.append(d)
        return Response(result)


# ── Bill ViewSet ───────────────────────────────────────────────────────────────

class KCBillViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        qs        = KCBill.objects.prefetch_related('lines').order_by('-created_at')
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        if date_from: qs = qs.filter(created_at__date__gte=date_from)
        if date_to:   qs = qs.filter(created_at__date__lte=date_to)
        return Response([serialize_bill(b) for b in qs])

    def retrieve(self, request, pk=None):
        try:
            bill = KCBill.objects.prefetch_related('lines').get(pk=pk)
        except KCBill.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        return Response(serialize_bill(bill))

    def create(self, request):
        data  = request.data
        lines = data.get('lines', [])
        total = Decimal(str(data.get('total', 0)))

        payment_type = data.get('payment_type', 'cash')
        cash_amount  = Decimal(str(data.get('cash_amount', total if payment_type == 'cash' else 0)))
        card_amount  = Decimal(str(data.get('card_amount', total if payment_type == 'card' else 0)))
        upi_amount   = Decimal(str(data.get('upi_amount',  total if payment_type == 'upi'  else 0)))

        if not lines:
            return Response({'detail': 'No items provided'}, status=400)

        today_stock          = get_today_stock()
        stock_controlled_ids = set()
        for grp in KCSaleItem.objects.filter(item_type='group', purchase_required=True).prefetch_related('sub_items'):
            for si in grp.sub_items.all():
                stock_controlled_ids.add(si.id)

        for l in lines:
            item_id   = l.get('item_id')
            qty       = Decimal(str(l.get('qty', 0)))
            item_name = l.get('item_name', '')
            if item_id in stock_controlled_ids:
                remaining = Decimal(str(today_stock.get(item_id, {}).get('remaining_qty', 0)))
                if qty > remaining:
                    return Response({'detail': f'Not enough stock for {item_name}. Available: {remaining}'}, status=400)

        bill = KCBill.objects.create(
            total=total,
            payment_type=payment_type,
            cash_amount=cash_amount,
            card_amount=card_amount,
            upi_amount=upi_amount,
            created_by=request.user,
        )
        for l in lines:
            KCBillLine.objects.create(
                bill=bill,
                item_id=l.get('item_id'),
                item_name=l.get('item_name', ''),
                qty=Decimal(str(l.get('qty', 1))),
                price=Decimal(str(l.get('price', 0))),
            )
        return Response(serialize_bill(bill), status=201)

    def destroy(self, request, pk=None):
        try:
            KCBill.objects.get(pk=pk).delete()
        except KCBill.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        return Response(status=204)

    @action(detail=True, methods=['patch'])
    def edit_payment(self, request, pk=None):
        try:
            bill = KCBill.objects.get(pk=pk)
        except KCBill.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        payment_type = request.data.get('payment_type', bill.payment_type)
        total        = bill.total
        if payment_type not in ['cash', 'card', 'upi', 'cash_card', 'cash_upi']:
            return Response({'detail': 'Invalid payment type'}, status=400)
        bill.payment_type = payment_type
        bill.cash_amount  = Decimal(str(request.data.get('cash_amount', total if payment_type == 'cash' else 0)))
        bill.card_amount  = Decimal(str(request.data.get('card_amount', total if payment_type == 'card' else 0)))
        bill.upi_amount   = Decimal(str(request.data.get('upi_amount',  total if payment_type == 'upi'  else 0)))
        bill.save()
        return Response(serialize_bill(bill))


# ── Purchase ViewSet ───────────────────────────────────────────────────────────

class KCPurchaseViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        qs        = KCPurchase.objects.prefetch_related('lines').order_by('-created_at')
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        if date_from: qs = qs.filter(created_at__date__gte=date_from)
        if date_to:   qs = qs.filter(created_at__date__lte=date_to)
        return Response([serialize_purchase(p) for p in qs])

    def create(self, request):
        data       = request.data
        lines      = data.get('lines', [])
        group_id   = data.get('group_id')
        group_name = data.get('group_name', '')
        if not lines:
            return Response({'detail': 'No items'}, status=400)

        from django.utils.dateparse import parse_date
        purchase_date = data.get('purchase_date')
        parsed_date   = parse_date(purchase_date) if purchase_date else None

        purchase = KCPurchase.objects.create(
            group_id=group_id, group_name=group_name,
            total=0, created_by=request.user,
        )
        if parsed_date:
            KCPurchase.objects.filter(pk=purchase.pk).update(
                created_at=purchase.created_at.replace(
                    year=parsed_date.year, month=parsed_date.month, day=parsed_date.day,
                )
            )
            purchase.refresh_from_db()

        for l in lines:
            KCPurchaseLine.objects.create(
                purchase=purchase,
                item_id=l.get('item_id'),
                item_name=l.get('item_name', ''),
                qty=Decimal(str(l.get('qty', 0))),
                cost=Decimal('0'),
            )
        return Response(serialize_purchase(purchase), status=201)

    def destroy(self, request, pk=None):
        try:
            KCPurchase.objects.get(pk=pk).delete()
        except KCPurchase.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        return Response(status=204)

    @action(detail=False, methods=['get'])
    def today(self, request):
        today_stock = get_today_stock()
        return Response(list(today_stock.values()))


# ── Stock ViewSet ──────────────────────────────────────────────────────────────

class KCStockViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        qs        = KCStock.objects.prefetch_related('lines').order_by('-created_at')
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        if date_from: qs = qs.filter(created_at__date__gte=date_from)
        if date_to:   qs = qs.filter(created_at__date__lte=date_to)
        return Response([serialize_stock(s) for s in qs])

    def create(self, request):
        data  = request.data
        lines = data.get('lines', [])
        if not lines:
            return Response({'detail': 'No items'}, status=400)
        stock = KCStock.objects.create(created_by=request.user)
        for l in lines:
            KCStockLine.objects.create(
                stock=stock,
                item_id=l.get('item_id'),
                item_name=l.get('item_name', ''),
                qty=Decimal(str(l.get('qty', 0))),
                carry_forward=bool(l.get('carry_forward', False)),
            )
        return Response(serialize_stock(stock), status=201)

    @action(detail=False, methods=['get'])
    def today(self, request):
        today_stock          = get_today_stock()
        stock_controlled_ids = set()
        for grp in KCSaleItem.objects.filter(item_type='group', purchase_required=True).prefetch_related('sub_items'):
            for si in grp.sub_items.all():
                stock_controlled_ids.add(si.id)
        filtered = {k: v for k, v in today_stock.items() if k in stock_controlled_ids}
        return Response(list(filtered.values()))


# ── Store Item ViewSet ─────────────────────────────────────────────────────────

class KCStoreItemViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        items = KCStoreItem.objects.all().order_by('name')
        return Response([{'id': i.id, 'name': i.name, 'unit': i.unit, 'is_active': i.is_active} for i in items])

    def create(self, request):
        data = request.data
        if not data.get('name', '').strip():
            return Response({'detail': 'Name required'}, status=400)
        item = KCStoreItem.objects.create(name=data['name'].strip(), unit=data.get('unit', 'kg'))
        return Response({'id': item.id, 'name': item.name, 'unit': item.unit, 'is_active': item.is_active}, status=201)

    def partial_update(self, request, pk=None):
        try:
            item = KCStoreItem.objects.get(pk=pk)
        except KCStoreItem.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        data = request.data
        if 'name'      in data: item.name      = data['name'].strip()
        if 'unit'      in data: item.unit      = data['unit']
        if 'is_active' in data: item.is_active = data['is_active']
        item.save()
        return Response({'id': item.id, 'name': item.name, 'unit': item.unit, 'is_active': item.is_active})


# ── Store Issue ViewSet ────────────────────────────────────────────────────────

class KCStoreIssueViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        qs        = KCStoreIssue.objects.prefetch_related('lines').order_by('-created_at')
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')
        if date_from: qs = qs.filter(created_at__date__gte=date_from)
        if date_to:   qs = qs.filter(created_at__date__lte=date_to)
        return Response([serialize_issue(i) for i in qs])

    def create(self, request):
        data  = request.data
        lines = data.get('lines', [])
        total = Decimal(str(data.get('total', 0)))
        if not lines:
            return Response({'detail': 'No items'}, status=400)
        issue = KCStoreIssue.objects.create(total=total, created_by=request.user)
        for l in lines:
            KCStoreIssueLine.objects.create(
                issue=issue,
                item_id=l.get('item_id'),
                item_name=l.get('item_name', ''),
                unit=l.get('unit', ''),
                qty=Decimal(str(l.get('qty', 0))),
                cost=Decimal(str(l.get('cost', 0))),
            )
        return Response(serialize_issue(issue), status=201)

    def destroy(self, request, pk=None):
        try:
            KCStoreIssue.objects.get(pk=pk).delete()
        except KCStoreIssue.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        return Response(status=204)


# ── Closing Stock ViewSet ──────────────────────────────────────────────────────

class KCClosingStockViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        """
        Returns all store items that have ever been issued,
        enriched with their current closing stock (if any) and last issue cost.
        Used for the closing stock search/entry UI.
        """
        # Get all item_ids that have ever been issued
        issued_item_ids = KCStoreIssueLine.objects.values_list('item_id', flat=True).distinct()

        items = KCStoreItem.objects.filter(id__in=issued_item_ids, is_active=True).order_by('name')

        result = []
        for item in items:
            # Last issue cost for this item
            last_line = KCStoreIssueLine.objects.filter(
                item_id=item.id, cost__gt=0
            ).order_by('-issue__created_at').first()
            last_cost = float(last_line.cost) if last_line else 0

            # Current closing stock (if any)
            try:
                cs      = KCClosingStock.objects.get(item=item)
                cs_qty  = float(cs.qty)
                cs_cost = float(cs.cost_per_unit)
                cs_updated = cs.updated_at
            except KCClosingStock.DoesNotExist:
                cs_qty     = 0
                cs_cost    = 0
                cs_updated = None

            result.append({
                'item_id':          item.id,
                'item_name':        item.name,
                'unit':             item.unit,
                'last_cost':        last_cost,
                'closing_qty':      cs_qty,
                'closing_cost':     cs_cost,
                'closing_updated':  cs_updated,
            })

        return Response(result)

    def create(self, request):
        """
        Save / overwrite closing stock for multiple items.
        Payload: { lines: [{item_id, qty}] }
        Uses last issue cost automatically.
        """
        lines = request.data.get('lines', [])
        if not lines:
            return Response({'detail': 'No items'}, status=400)

        saved = []
        for l in lines:
            item_id = l.get('item_id')
            qty     = Decimal(str(l.get('qty', 0)))
            try:
                item = KCStoreItem.objects.get(pk=item_id)
            except KCStoreItem.DoesNotExist:
                continue

            # Get last issue cost
            last_line = KCStoreIssueLine.objects.filter(
                item_id=item_id, cost__gt=0
            ).order_by('-issue__created_at').first()
            cost_per_unit = last_line.cost if last_line else Decimal('0')

            # Upsert — always overwrite
            obj, _ = KCClosingStock.objects.update_or_create(
                item=item,
                defaults={
                    'qty':          qty,
                    'cost_per_unit': cost_per_unit,
                    'updated_by':   request.user,
                }
            )
            saved.append({
                'item_id':   item.id,
                'item_name': item.name,
                'qty':       float(qty),
                'cost':      float(cost_per_unit),
            })

        return Response({'saved': saved, 'count': len(saved)}, status=201)


# ── Report View ────────────────────────────────────────────────────────────────

class KCReportView(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        rtype     = request.query_params.get('type', 'daily_sale')
        date_from = request.query_params.get('date_from')
        date_to   = request.query_params.get('date_to')

        if rtype == 'daily_sale':
            qs = KCBill.objects.all()
            if date_from: qs = qs.filter(created_at__date__gte=date_from)
            if date_to:   qs = qs.filter(created_at__date__lte=date_to)
            qs          = qs.order_by('-created_at')
            grand_total = float(qs.aggregate(t=Sum('total'))['t'] or 0)

            pure_cash  = float(qs.filter(payment_type='cash').aggregate(t=Sum('total'))['t'] or 0)
            split_cash = float(qs.filter(payment_type__in=['cash_card', 'cash_upi']).aggregate(t=Sum('cash_amount'))['t'] or 0)
            pure_card  = float(qs.filter(payment_type='card').aggregate(t=Sum('total'))['t'] or 0)
            split_card = float(qs.filter(payment_type='cash_card').aggregate(t=Sum('card_amount'))['t'] or 0)
            pure_upi   = float(qs.filter(payment_type='upi').aggregate(t=Sum('total'))['t'] or 0)
            split_upi  = float(qs.filter(payment_type='cash_upi').aggregate(t=Sum('upi_amount'))['t'] or 0)

            return Response({
                'total_bills': qs.count(),
                'grand_total': grand_total,
                'cash_total':  round(pure_cash  + split_cash, 2),
                'card_total':  round(pure_card  + split_card, 2),
                'upi_total':   round(pure_upi   + split_upi,  2),
                'bills': [
                    {
                        'id':           b.id,
                        'bill_number':  b.bill_number,
                        'payment_type': b.payment_type,
                        'created_at':   b.created_at,
                        'total':        str(b.total),
                    }
                    for b in qs
                ],
            })

        if rtype == 'itemwise':
            qs = KCBillLine.objects.all()
            if date_from: qs = qs.filter(bill__created_at__date__gte=date_from)
            if date_to:   qs = qs.filter(bill__created_at__date__lte=date_to)
            items = {}
            for l in qs:
                key = l.item_name
                if key not in items:
                    items[key] = {'item_name': key, 'total_qty': 0, 'total_amount': 0}
                items[key]['total_qty']    += float(l.qty)
                items[key]['total_amount'] += float(l.qty) * float(l.price)
            result = sorted(items.values(), key=lambda x: x['total_amount'], reverse=True)
            grand  = sum(r['total_amount'] for r in result)
            return Response({'items': result, 'grand_total': round(grand, 2)})

        if rtype == 'purchase':
            qs = KCPurchase.objects.prefetch_related('lines').order_by('-created_at')
            if date_from: qs = qs.filter(created_at__date__gte=date_from)
            if date_to:   qs = qs.filter(created_at__date__lte=date_to)

            result = []
            for p in qs:
                lines = []
                for l in p.lines.all():
                    sold_qty = KCBillLine.objects.filter(
                        bill__created_at__date=p.created_at.date(),
                        item_id=l.item_id,
                    ).aggregate(t=Sum('qty'))['t'] or Decimal('0')

                    prev_day    = p.created_at.date() - datetime.timedelta(days=1)
                    carried_qty = KCStockLine.objects.filter(
                        stock__created_at__date=prev_day,
                        item_id=l.item_id,
                        carry_forward=True,
                    ).aggregate(t=Sum('qty'))['t'] or Decimal('0')

                    total_stock = l.qty + carried_qty
                    balance_qty = max(total_stock - sold_qty, Decimal('0'))

                    price = Decimal('0')
                    try:
                        sub = KCSaleSubItem.objects.filter(id=l.item_id).first()
                        if sub:
                            price = sub.price
                        else:
                            item_obj = KCSaleItem.objects.filter(id=l.item_id).first()
                            if item_obj:
                                price = item_obj.price
                    except Exception:
                        pass

                    lines.append({
                        'item_id':       l.item_id,
                        'item_name':     l.item_name,
                        'purchased_qty': float(l.qty),
                        'carried_qty':   float(carried_qty),
                        'sold_qty':      float(sold_qty),
                        'balance_qty':   float(balance_qty),
                        'price':         float(price),
                        'sale_amount':   float(sold_qty * price),
                    })
                result.append({
                    'id':              p.id,
                    'purchase_number': p.purchase_number,
                    'group_name':      p.group_name,
                    'created_at':      p.created_at,
                    'lines':           lines,
                })
            return Response({'purchases': result, 'grand_total': 0})

        if rtype == 'balance':
            qs = KCStock.objects.prefetch_related('lines').order_by('-created_at')
            if date_from: qs = qs.filter(created_at__date__gte=date_from)
            if date_to:   qs = qs.filter(created_at__date__lte=date_to)
            return Response({'stock': [serialize_stock(s) for s in qs]})

        if rtype == 'store_issue':
            qs    = KCStoreIssue.objects.prefetch_related('lines').order_by('-created_at')
            if date_from: qs = qs.filter(created_at__date__gte=date_from)
            if date_to:   qs = qs.filter(created_at__date__lte=date_to)

            # Build per-item summary: total qty issued + last cost + closing stock
            item_summary = {}
            for issue in qs:
                for l in issue.lines.all():
                    key = l.item_id
                    if key not in item_summary:
                        item_summary[key] = {
                            'item_id':    l.item_id,
                            'item_name':  l.item_name,
                            'unit':       l.unit,
                            'issued_qty': Decimal('0'),
                            'last_cost':  Decimal('0'),
                        }
                    item_summary[key]['issued_qty'] += l.qty
                    if l.cost > 0:
                        item_summary[key]['last_cost'] = l.cost  # keeps last encountered

            # Attach closing stock for each item
            result_items = []
            for item_id, s in item_summary.items():
                try:
                    cs          = KCClosingStock.objects.get(item_id=item_id)
                    closing_qty  = float(cs.qty)
                    closing_cost = float(cs.cost_per_unit)
                except KCClosingStock.DoesNotExist:
                    closing_qty  = 0
                    closing_cost = float(s['last_cost'])

                issued_qty  = float(s['issued_qty'])
                last_cost   = float(s['last_cost'])

                result_items.append({
                    'item_id':        item_id,
                    'item_name':      s['item_name'],
                    'unit':           s['unit'],
                    'issued_qty':     issued_qty,
                    'issue_cost':     round(issued_qty * last_cost, 2),   # cost of issued
                    'last_cost':      last_cost,
                    'closing_qty':    closing_qty,
                    'closing_cost':   round(closing_qty * (closing_cost or last_cost), 2),  # value of remaining
                    'closing_updated': str(cs.updated_at) if closing_qty > 0 else None,
                })

            # Also return raw issues for the detailed view
            grand = sum(float(i.total) for i in qs)
            issues_data = []
            for i in qs:
                for l in i.lines.all():
                    issues_data.append({
                        'id':           i.id,
                        'issue_number': i.issue_number,
                        'created_at':   i.created_at,
                        'item_name':    l.item_name,
                        'unit':         l.unit,
                        'qty':          str(l.qty),
                        'cost':         str(l.cost),
                        'total':        str(l.qty * l.cost),
                    })

            return Response({
                'issues':      issues_data,
                'grand_total': round(grand, 2),
                'item_summary': result_items,  # ← new field for summary view
            })

        return Response({'detail': 'Unknown report type'}, status=400)