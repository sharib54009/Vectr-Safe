"""Send private journey-group messages through the configured Channels layer."""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def publish_journey_event(journey_id, event_name, payload):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            f"journey_{journey_id}", {"type": event_name, "payload": {"event": event_name, **payload}}
        )
    except Exception:
        # Persisted events remain available through the consumer's database polling path.
        logger.exception("Could not publish a Channels event for journey %s", journey_id)
