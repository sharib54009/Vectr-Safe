from django.urls import re_path

from .consumers import JourneyConsumer


websocket_urlpatterns = [
    re_path(r"^ws/journeys/(?P<journey_id>\d+)/$", JourneyConsumer.as_asgi()),
]
