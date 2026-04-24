from django.urls import path
from .views import GenerateBarcodeView, ProductSearchView, ProductCreateView

urlpatterns = [
    path('search/', ProductSearchView.as_view()),
    path('create/', ProductCreateView.as_view()),
    path('generate-barcode/', GenerateBarcodeView.as_view()),
]