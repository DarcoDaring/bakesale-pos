from django.db import models, transaction
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin


class UserManager(BaseUserManager):
    def create_user(self, username, password=None, role='general'):
        if not username:
            raise ValueError('Username is required')
        user = self.model(username=username, role=role)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None):
        user = self.create_user(username, password, role='admin')
        user.is_staff = True
        user.is_superuser = True
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = [('admin', 'Admin'), ('general', 'General')]
    username   = models.CharField(max_length=150, unique=True)
    role       = models.CharField(max_length=20, choices=ROLE_CHOICES, default='general')
    is_active  = models.BooleanField(default=True)
    is_staff   = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD  = 'username'
    REQUIRED_FIELDS = []
    objects = UserManager()

    def __str__(self):
        return self.username


def generate_barcode():
    prefix = 'BAR-'
    with transaction.atomic():
        last = (
            Product.objects.select_for_update()
            .filter(barcode__startswith=prefix)
            .order_by('-id')
            .first()
        )
        if last:
            try:
                num = int(last.barcode.replace(prefix, '')) + 1
            except ValueError:
                num = 1
        else:
            num = 1
        while Product.objects.filter(barcode=f"{prefix}{num}").exists():
            num += 1
        return f"{prefix}{num}"


class Vendor(models.Model):
    name       = models.CharField(max_length=200)
    phone      = models.CharField(max_length=20, blank=True, null=True)
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Product(models.Model):
    UNIT_CHOICES = [
        ('nos', 'Nos'), ('kg', 'Kg'), ('case', 'case'),
    ]
    barcode          = models.CharField(max_length=50, unique=True, blank=True)
    name             = models.CharField(max_length=200)
    selling_price    = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    selling_unit     = models.CharField(max_length=10, choices=UNIT_CHOICES, default='nos')
    tax              = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    stock_quantity   = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    damaged_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    expired_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    is_active        = models.BooleanField(default=True)
    created_at       = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.barcode:
            self.barcode = generate_barcode()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.barcode})"


class StockBatch(models.Model):
    product    = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='batches')
    mrp        = models.DecimalField(max_digits=10, decimal_places=2)
    quantity   = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['mrp', 'created_at']

    def __str__(self):
        return f"{self.product.name} @ ₹{self.mrp} — {self.quantity} left"


class PurchaseBill(models.Model):
    purchase_number = models.CharField(max_length=50, unique=True, blank=True)
    vendor          = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchases')
    is_paid         = models.BooleanField(default=True)
    date            = models.DateTimeField(auto_now_add=True)
    created_by      = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    @classmethod
    def generate_purchase_number(cls):
        prefix = 'PB-'
        with transaction.atomic():
            last = (
                cls.objects.select_for_update()
                .filter(purchase_number__startswith=prefix)
                .order_by('-id')
                .first()
            )
            if last and last.purchase_number:
                try:
                    num = int(last.purchase_number.replace(prefix, '')) + 1
                except ValueError:
                    num = 1
            else:
                num = 1
            while cls.objects.filter(purchase_number=f"{prefix}{num}").exists():
                num += 1
            return f"{prefix}{num}"

    def __str__(self):
        return f"Purchase #{self.purchase_number}"


class Purchase(models.Model):
    UNIT_CHOICES = [
        ('nos', 'Nos'), ('kg', 'Kg'), ('case', 'case'),
    ]
    TAX_TYPE_CHOICES = [
        ('excluding', 'Tax Excluding'),
        ('including', 'Tax Including'),
    ]
    bill           = models.ForeignKey(PurchaseBill, on_delete=models.CASCADE, related_name='items', null=True, blank=True)
    product        = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='purchases')
    purchase_unit  = models.CharField(max_length=10, choices=UNIT_CHOICES, default='nos')
    quantity       = models.DecimalField(max_digits=12, decimal_places=3)
    purchase_price = models.DecimalField(max_digits=10, decimal_places=2)
    tax            = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_type       = models.CharField(max_length=10, choices=TAX_TYPE_CHOICES, default='excluding')
    mrp            = models.DecimalField(max_digits=10, decimal_places=2)
    selling_unit   = models.CharField(max_length=10, choices=UNIT_CHOICES, default='nos')
    selling_qty    = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    date           = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Purchase: {self.product.name} x{self.quantity}"


class SaleBill(models.Model):
    PAYMENT_CHOICES = [
        ('cash', 'Cash'), ('card', 'Card'), ('upi', 'UPI'),
        ('cash_card', 'Cash & Card'), ('cash_upi', 'Cash & UPI'),
    ]
    bill_number  = models.CharField(max_length=50, unique=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_type = models.CharField(max_length=10, choices=PAYMENT_CHOICES)
    cash_amount  = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    card_amount  = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    upi_amount   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at   = models.DateTimeField(auto_now_add=True)
    created_by   = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"Bill #{self.bill_number}"

    @classmethod
    def generate_bill_number(cls):
        prefix = 'SB-'
        with transaction.atomic():
            last = (
                cls.objects.select_for_update()
                .filter(bill_number__startswith=prefix)
                .order_by('-id')
                .first()
            )
            if last:
                try:
                    num = int(last.bill_number.replace(prefix, '')) + 1
                except ValueError:
                    num = 1
            else:
                num = 1
            while cls.objects.filter(bill_number=f"{prefix}{num}").exists():
                num += 1
            return f"{prefix}{num}"


class SaleItem(models.Model):
    bill     = models.ForeignKey(SaleBill, on_delete=models.CASCADE, related_name='items')
    product  = models.ForeignKey(Product, on_delete=models.CASCADE)
    batch    = models.ForeignKey(StockBatch, on_delete=models.SET_NULL, null=True, blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    price    = models.DecimalField(max_digits=10, decimal_places=2)
    tax      = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    @property
    def subtotal(self):
        return self.quantity * self.price

    def __str__(self):
        return f"{self.product.name} x{self.quantity} @ ₹{self.price}"


class ReturnItem(models.Model):
    RETURN_TYPE_CHOICES = [
        ('customer_return', 'Customer Return'),
        ('damaged', 'Damaged'),
        ('expired', 'Expired'),
    ]
    product      = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='returns')
    return_type  = models.CharField(max_length=20, choices=RETURN_TYPE_CHOICES)
    quantity     = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    date         = models.DateTimeField(auto_now_add=True)
    processed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"Return: {self.product.name} - {self.return_type}"


class InternalSaleMaster(models.Model):
    name       = models.CharField(max_length=100, unique=True)
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return self.name


class InternalSale(models.Model):
    bill        = models.ForeignKey('InternalSaleBill', on_delete=models.CASCADE, related_name='items', null=True, blank=True)
    product     = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='internal_sales')
    destination = models.ForeignKey(InternalSaleMaster, on_delete=models.CASCADE, related_name='items')
    quantity    = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    price       = models.DecimalField(max_digits=10, decimal_places=2)
    date        = models.DateTimeField(auto_now_add=True)
    created_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.product.name} → {self.destination.name} x{self.quantity}"


class PurchaseReturn(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending Return'),
        ('returned', 'Product Returned'),
    ]
    return_number  = models.CharField(max_length=50, unique=True, blank=True, null=True)
    product        = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='purchase_returns')
    vendor         = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchase_returns')
    quantity       = models.DecimalField(max_digits=12, decimal_places=3)
    purchase_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax            = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    reason         = models.TextField(blank=True)
    status         = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    date           = models.DateTimeField(auto_now_add=True)
    created_by     = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    @classmethod
    def generate_return_number(cls):
        prefix = 'PR-'
        with transaction.atomic():
            last = (
                cls.objects.select_for_update()
                .filter(return_number__startswith=prefix)
                .order_by('-id')
                .first()
            )
            num = 1
            if last and last.return_number:
                try:
                    num = int(last.return_number.replace(prefix, '')) + 1
                except ValueError:
                    pass
            while cls.objects.filter(return_number=f"{prefix}{num}").exists():
                num += 1
            return f"{prefix}{num}"

    def save(self, *args, **kwargs):
        if not self.return_number:
            self.return_number = self.generate_return_number()
        super().save(*args, **kwargs)

    @property
    def item_cost(self):
        return float(self.purchase_price) * (1 + float(self.tax) / 100) * float(self.quantity)

    def __str__(self):
        return f"PurchaseReturn: {self.product.name} x{self.quantity}"


class DirectSaleMaster(models.Model):
    name       = models.CharField(max_length=200)
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return self.name


class DirectSale(models.Model):
    @classmethod
    def generate_sale_number(cls):
        prefix = 'DS-'
        with transaction.atomic():
            last = (
                cls.objects.select_for_update()
                .filter(sale_number__startswith=prefix)
                .order_by('-id')
                .first()
            )
            num = 1
            if last and getattr(last, 'sale_number', None):
                try:
                    num = int(last.sale_number.replace(prefix, '')) + 1
                except ValueError:
                    pass
            while cls.objects.filter(sale_number=f"{prefix}{num}").exists():
                num += 1
            return f"{prefix}{num}"

    PAYMENT_CHOICES = [
        ('cash', 'Cash'), ('card', 'Card'), ('upi', 'UPI'),
        ('cash_card', 'Cash & Card'), ('cash_upi', 'Cash & UPI'),
    ]
    sale_number  = models.CharField(max_length=50, unique=True, blank=True, null=True)
    item         = models.ForeignKey(DirectSaleMaster, on_delete=models.CASCADE, related_name='sales')
    price        = models.DecimalField(max_digits=10, decimal_places=2)
    payment_type = models.CharField(max_length=10, choices=PAYMENT_CHOICES)
    cash_amount  = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    card_amount  = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    upi_amount   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    date         = models.DateTimeField(auto_now_add=True)
    created_by   = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.sale_number:
            self.sale_number = self.generate_sale_number()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"DirectSale: {self.item.name} — ₹{self.price}"


class PhysicalStockRequest(models.Model):
    STATUS_CHOICES = [('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')]
    request_number = models.CharField(max_length=50, unique=True, blank=True)
    status         = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    reason         = models.TextField(blank=True)
    requested_by   = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='ps_requests')
    reviewed_by    = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='ps_reviews')
    created_at     = models.DateTimeField(auto_now_add=True)
    reviewed_at    = models.DateTimeField(null=True, blank=True)

    @classmethod
    def generate_request_number(cls):
        prefix = 'PS-'
        with transaction.atomic():
            last = (
                cls.objects.select_for_update()
                .filter(request_number__startswith=prefix)
                .order_by('-id')
                .first()
            )
            num = 1
            if last and last.request_number:
                try:
                    num = int(last.request_number.replace(prefix, '')) + 1
                except ValueError:
                    pass
            while cls.objects.filter(request_number=f"{prefix}{num}").exists():
                num += 1
            return f"{prefix}{num}"

    def save(self, *args, **kwargs):
        if not self.request_number:
            self.request_number = self.generate_request_number()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"PhysicalStock #{self.request_number}"


class StockAdjustmentRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected'),
    ]
    ps_request     = models.ForeignKey(PhysicalStockRequest, on_delete=models.CASCADE, related_name='items', null=True, blank=True)
    product        = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='stock_adjustments')
    system_stock   = models.DecimalField(max_digits=12, decimal_places=3)
    physical_stock = models.DecimalField(max_digits=12, decimal_places=3)
    status         = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    reason         = models.TextField(blank=True)
    requested_by   = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='stock_requests')
    reviewed_by    = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='stock_reviews')
    created_at     = models.DateTimeField(auto_now_add=True)
    reviewed_at    = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"StockAdj: {self.product.name} [{self.status}]"


class StockTransfer(models.Model):
    product        = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='stock_transfers')
    quantity       = models.DecimalField(max_digits=12, decimal_places=3)
    mrp            = models.DecimalField(max_digits=10, decimal_places=2)
    purchase_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax            = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    date           = models.DateTimeField(auto_now_add=True)
    created_by     = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"StockTransfer: {self.product.name} x{self.quantity}"


class UserPermission(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='permission')

    # Page access
    can_access_sale     = models.BooleanField(default=True)
    can_access_purchase = models.BooleanField(default=True)
    can_access_reports  = models.BooleanField(default=True)
    can_access_stock    = models.BooleanField(default=True)

    # Sale sub-permissions
    can_edit_bill          = models.BooleanField(default=True)
    can_delete_bill        = models.BooleanField(default=True)
    can_access_direct_sale = models.BooleanField(default=True)

    # Purchase sub-permissions
    can_access_vendor_master   = models.BooleanField(default=True)
    can_access_product_master  = models.BooleanField(default=True)
    can_access_purchase_return = models.BooleanField(default=True)

    # Reports sub-permissions
    can_view_sale_report      = models.BooleanField(default=True)
    can_view_itemwise_report  = models.BooleanField(default=True)
    can_view_internal_report  = models.BooleanField(default=True)
    can_view_purreturn_report = models.BooleanField(default=True)
    can_view_purchase_report  = models.BooleanField(default=True)
    can_view_salestax_report  = models.BooleanField(default=True)
    can_view_purtax_report    = models.BooleanField(default=True)
    can_view_direct_report    = models.BooleanField(default=True)
    can_print_reports         = models.BooleanField(default=True)

    # Stock sub-permissions
    can_stock_transfer  = models.BooleanField(default=True)
    can_opening_stock   = models.BooleanField(default=True)
    can_physical_stock  = models.BooleanField(default=True)
    can_stock_report    = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'User Permission'

    def __str__(self):
        return f'Permissions for {self.user.username}'


class ItemReturn(models.Model):
    PAYMENT_CHOICES = [
        ('cash', 'Cash'), ('card', 'Card'), ('upi', 'UPI'),
        ('cash_card', 'Cash & Card'), ('cash_upi', 'Cash & UPI'),
    ]
    return_number = models.CharField(max_length=50, unique=True, blank=True)
    payment_type  = models.CharField(max_length=10, choices=PAYMENT_CHOICES, default='cash')
    cash_amount   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    card_amount   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    upi_amount    = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount  = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    date          = models.DateTimeField(auto_now_add=True)
    created_by    = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    @classmethod
    def generate_return_number(cls):
        prefix = 'IR-'
        with transaction.atomic():
            last = (
                cls.objects.select_for_update()
                .filter(return_number__startswith=prefix)
                .order_by('-id')
                .first()
            )
            num = 1
            if last and last.return_number:
                try:
                    num = int(last.return_number.replace(prefix, '')) + 1
                except ValueError:
                    pass
            while cls.objects.filter(return_number=f"{prefix}{num}").exists():
                num += 1
            return f"{prefix}{num}"

    def save(self, *args, **kwargs):
        if not self.return_number:
            self.return_number = self.generate_return_number()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"ItemReturn #{self.return_number}"


class ItemReturnLine(models.Model):
    RETURN_TYPE_CHOICES = [
        ('customer_return', 'Customer Return'),
        ('damaged',         'Damaged'),
        ('expired',         'Expired'),
    ]
    item_return = models.ForeignKey(ItemReturn, on_delete=models.CASCADE, related_name='lines')
    product     = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='item_returns')
    sale_bill   = models.ForeignKey(SaleBill, on_delete=models.SET_NULL, null=True, blank=True, related_name='return_lines')
    quantity    = models.DecimalField(max_digits=12, decimal_places=3)
    price       = models.DecimalField(max_digits=10, decimal_places=2)
    return_type = models.CharField(max_length=20, choices=RETURN_TYPE_CHOICES, default='customer_return')

    def __str__(self):
        return f"{self.product.name} x{self.quantity} ({self.return_type})"


class InternalSaleBill(models.Model):
    sale_number = models.CharField(max_length=50, unique=True, blank=True)
    destination = models.ForeignKey(InternalSaleMaster, on_delete=models.CASCADE, related_name='bills')
    date        = models.DateTimeField(auto_now_add=True)
    created_by  = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    @classmethod
    def generate_sale_number(cls):
        prefix = 'IS-'
        with transaction.atomic():
            last = (
                cls.objects.select_for_update()
                .filter(sale_number__startswith=prefix)
                .order_by('-id')
                .first()
            )
            num = 1
            if last and last.sale_number:
                try:
                    num = int(last.sale_number.replace(prefix, '')) + 1
                except ValueError:
                    pass
            while cls.objects.filter(sale_number=f"{prefix}{num}").exists():
                num += 1
            return f"{prefix}{num}"

    def save(self, *args, **kwargs):
        if not self.sale_number:
            self.sale_number = self.generate_sale_number()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"InternalSale #{self.sale_number}"