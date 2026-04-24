from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Product, Purchase, SaleBill, SaleItem, ReturnItem

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'role', 'is_active', 'created_at']
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Info', {'fields': ('role', 'is_active', 'is_staff')}),
    )
    add_fieldsets = (
        (None, {'fields': ('username', 'password1', 'password2', 'role')}),
    )
    ordering = ['username']

admin.site.register(Product)
admin.site.register(Purchase)
admin.site.register(SaleBill)
admin.site.register(SaleItem)
admin.site.register(ReturnItem)
