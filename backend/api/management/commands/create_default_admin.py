from django.core.management.base import BaseCommand
from api.models import User


class Command(BaseCommand):
    help = 'Create default admin user'

    def handle(self, *args, **options):
        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser('admin', 'admin123')
            self.stdout.write(self.style.SUCCESS('✅ Default admin created: admin / admin123'))
        else:
            self.stdout.write(self.style.WARNING('Admin user already exists'))
