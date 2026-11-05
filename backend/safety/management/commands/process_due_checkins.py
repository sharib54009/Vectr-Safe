import logging
import time

from django.conf import settings
from django.core.management.base import BaseCommand

from safety.services import process_due_checkins

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Escalate overdue safety check-ins. Run as a separate development worker."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Process due check-ins once and exit.")
        parser.add_argument("--interval", type=float, default=5.0, help="Seconds between checks (default: 5).")

    def handle(self, *args, **options):
        interval = max(0.5, options["interval"])
        self.stdout.write("Safety check-in worker started.")
        while True:
            try:
                alerts = process_due_checkins()
                if alerts:
                    self.stdout.write(f"Escalated {len(alerts)} overdue check-in(s).")
            except Exception:
                logger.exception("Could not process due safety check-ins")
                self.stderr.write("A check-in processing error occurred; it will retry.")
            if options["once"]:
                break
            time.sleep(interval)
