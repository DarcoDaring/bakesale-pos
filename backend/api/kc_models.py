from django.db import models, transaction
from decimal import Decimal


class KCSaleItem(models.Model):
    TYPE_CHOICES = [('direct', 'Direct'), ('group', 'Group')]
    name       = models.CharField(max_length=200)
    item_type  = models.CharField(max_length=10, choices=TYPE_CHOICES, default='direct')
    price      = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    purchase_required = models.BooleanField(default=False)  


class KCSaleSubItem(models.Model):
    parent = models.ForeignKey(KCSaleItem, on_delete=models.CASCADE, related_name='sub_items')
    name   = models.CharField(max_length=200)
    price  = models.DecimalField(max_digits=10, decimal_places=2)


class KCBill(models.Model):
    bill_number = models.CharField(max_length=50, unique=True, blank=True)
    total       = models.DecimalField(max_digits=12, decimal_places=2)
    PAYMENT_CHOICES = [
    ('cash','Cash'),('card','Card'),('upi','UPI'),
        ('cash_card','Cash & Card'),('cash_upi','Cash & UPI'),
    ]
    payment_type = models.CharField(max_length=10, choices=PAYMENT_CHOICES, default='cash')
    cash_amount  = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    card_amount  = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    upi_amount   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at  = models.DateTimeField(auto_now_add=True)
    created_by  = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True)

    @classmethod
    def generate_bill_number(cls):
        prefix = 'KC-'
        with transaction.atomic():
            last = cls.objects.select_for_update().filter(bill_number__startswith=prefix).order_by('-id').first()
            num = 1
            if last and last.bill_number:
                try: num = int(last.bill_number.replace(prefix, '')) + 1
                except ValueError: pass
            while cls.objects.filter(bill_number=f"{prefix}{num}").exists():
                num += 1
            return f"{prefix}{num}"

    def save(self, *args, **kwargs):
        if not self.bill_number:
            self.bill_number = self.generate_bill_number()
        super().save(*args, **kwargs)


class KCBillLine(models.Model):
    bill      = models.ForeignKey(KCBill, on_delete=models.CASCADE, related_name='lines')
    item_id   = models.IntegerField(null=True, blank=True)
    item_name = models.CharField(max_length=200)
    qty       = models.DecimalField(max_digits=10, decimal_places=3)
    price     = models.DecimalField(max_digits=10, decimal_places=2)


class KCPurchase(models.Model):
    purchase_number = models.CharField(max_length=50, unique=True, blank=True)
    group_id        = models.IntegerField(null=True, blank=True)
    group_name      = models.CharField(max_length=200, blank=True)
    total           = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at      = models.DateTimeField(auto_now_add=True)
    created_by      = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True)

    @classmethod
    def generate_purchase_number(cls):
        prefix = 'KP-'
        with transaction.atomic():
            last = cls.objects.select_for_update().filter(purchase_number__startswith=prefix).order_by('-id').first()
            num = 1
            if last and last.purchase_number:
                try: num = int(last.purchase_number.replace(prefix, '')) + 1
                except ValueError: pass
            while cls.objects.filter(purchase_number=f"{prefix}{num}").exists():
                num += 1
            return f"{prefix}{num}"

    def save(self, *args, **kwargs):
        if not self.purchase_number:
            self.purchase_number = self.generate_purchase_number()
        super().save(*args, **kwargs)


class KCPurchaseLine(models.Model):
    purchase  = models.ForeignKey(KCPurchase, on_delete=models.CASCADE, related_name='lines')
    item_id   = models.IntegerField(null=True, blank=True)
    item_name = models.CharField(max_length=200)
    qty       = models.DecimalField(max_digits=10, decimal_places=3)
    cost      = models.DecimalField(max_digits=10, decimal_places=2, default=0)


class KCStock(models.Model):
    stock_number = models.CharField(max_length=50, unique=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    created_by   = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True)

    @classmethod
    def generate_stock_number(cls):
        prefix = 'KS-'
        with transaction.atomic():
            last = cls.objects.select_for_update().filter(stock_number__startswith=prefix).order_by('-id').first()
            num = 1
            if last and last.stock_number:
                try: num = int(last.stock_number.replace(prefix, '')) + 1
                except ValueError: pass
            while cls.objects.filter(stock_number=f"{prefix}{num}").exists():
                num += 1
            return f"{prefix}{num}"

    def save(self, *args, **kwargs):
        if not self.stock_number:
            self.stock_number = self.generate_stock_number()
        super().save(*args, **kwargs)


class KCStockLine(models.Model):
    stock         = models.ForeignKey(KCStock, on_delete=models.CASCADE, related_name='lines')
    item_id       = models.IntegerField(null=True, blank=True)
    item_name     = models.CharField(max_length=200)
    qty           = models.DecimalField(max_digits=10, decimal_places=3)
    carry_forward = models.BooleanField(default=False)   # ← carry to tomorrow's stock


class KCStoreItem(models.Model):
    UNIT_CHOICES = [('kg','kg'),('nos','nos'),('case','case'),('litre','litre'),('packet','packet'),('box','box')]
    name       = models.CharField(max_length=200, unique=True)
    unit       = models.CharField(max_length=20, choices=UNIT_CHOICES, default='kg')
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)


class KCStoreIssue(models.Model):
    issue_number = models.CharField(max_length=50, unique=True, blank=True)
    total        = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at   = models.DateTimeField(auto_now_add=True)
    created_by   = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True)

    @classmethod
    def generate_issue_number(cls):
        prefix = 'KI-'
        with transaction.atomic():
            last = cls.objects.select_for_update().filter(issue_number__startswith=prefix).order_by('-id').first()
            num = 1
            if last and last.issue_number:
                try: num = int(last.issue_number.replace(prefix, '')) + 1
                except ValueError: pass
            while cls.objects.filter(issue_number=f"{prefix}{num}").exists():
                num += 1
            return f"{prefix}{num}"

    def save(self, *args, **kwargs):
        if not self.issue_number:
            self.issue_number = self.generate_issue_number()
        super().save(*args, **kwargs)


class KCStoreIssueLine(models.Model):
    issue     = models.ForeignKey(KCStoreIssue, on_delete=models.CASCADE, related_name='lines')
    item_id   = models.IntegerField(null=True, blank=True)
    item_name = models.CharField(max_length=200)
    unit      = models.CharField(max_length=20)
    qty       = models.DecimalField(max_digits=10, decimal_places=3)
    cost      = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    @property
    def total(self):
        return self.qty * self.cost
    

class KCClosingStock(models.Model):
    item          = models.OneToOneField(KCStoreItem, on_delete=models.CASCADE, related_name='closing_stock')
    qty           = models.DecimalField(max_digits=10, decimal_places=3)
    cost_per_unit = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    updated_at    = models.DateTimeField(auto_now=True)
    updated_by    = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True)