"""Development settings for the VectrSafe Django API."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-change-me")
DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = [host.strip() for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost,testserver").split(",") if host.strip()]

INSTALLED_APPS = [
    "django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes",
    "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles",
    "rest_framework", "channels", "corsheaders", "accounts", "journeys", "risk", "safety",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware", "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware", "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware", "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [], "APP_DIRS": True,
              "OPTIONS": {"context_processors": ["django.template.context_processors.request", "django.contrib.auth.context_processors.auth", "django.contrib.messages.context_processors.messages"]}}]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": os.environ.get("DJANGO_DATABASE_PATH", str(BASE_DIR / "django.sqlite3"))}}
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
}
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
CORS_ALLOWED_ORIGINS = [origin.strip() for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = list(CORS_ALLOWED_ORIGINS)
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# These are starting product settings, not scientifically validated danger thresholds.
DEFAULT_ROUTE_CORRIDOR_METERS = int(os.environ.get("ROUTE_CORRIDOR_METERS", "100"))
ROUTE_DEVIATION_SAMPLE_COUNT = int(os.environ.get("ROUTE_DEVIATION_SAMPLE_COUNT", "3"))
ROUTE_DEVIATION_WINDOW_SAMPLES = int(os.environ.get("ROUTE_DEVIATION_WINDOW_SAMPLES", "3"))
STOP_RADIUS_METERS = int(os.environ.get("STOP_RADIUS_METERS", "30"))
STOP_DURATION_SECONDS = int(os.environ.get("STOP_DURATION_SECONDS", "180"))
RISK_CLEAR_SAMPLE_COUNT = int(os.environ.get("RISK_CLEAR_SAMPLE_COUNT", "3"))
RISK_ELEVATED_THRESHOLD = int(os.environ.get("RISK_ELEVATED_THRESHOLD", "40"))
RISK_HIGH_THRESHOLD = int(os.environ.get("RISK_HIGH_THRESHOLD", "75"))
RISK_BASE_SCORE = int(os.environ.get("RISK_BASE_SCORE", "10"))
ROUTE_DEVIATION_WEIGHT = int(os.environ.get("ROUTE_DEVIATION_WEIGHT", "35"))
PROLONGED_STOP_WEIGHT = int(os.environ.get("PROLONGED_STOP_WEIGHT", "30"))
WRONG_DIRECTION_WEIGHT = int(os.environ.get("WRONG_DIRECTION_WEIGHT", "30"))
UNUSUAL_MOVEMENT_WEIGHT = int(os.environ.get("UNUSUAL_MOVEMENT_WEIGHT", "20"))
LATE_JOURNEY_WEIGHT = int(os.environ.get("LATE_JOURNEY_WEIGHT", "15"))
UNUSUAL_SPEED_METERS_PER_SECOND = float(os.environ.get("UNUSUAL_SPEED_METERS_PER_SECOND", "40"))
WRONG_DIRECTION_MIN_DISTANCE_METERS = int(os.environ.get("WRONG_DIRECTION_MIN_DISTANCE_METERS", "20"))
WRONG_DIRECTION_HEADING_DEGREES = int(os.environ.get("WRONG_DIRECTION_HEADING_DEGREES", "120"))
SAFETY_CHECKIN_TIMEOUT_SECONDS = int(os.environ.get("SAFETY_CHECKIN_TIMEOUT_SECONDS", "60"))
SAFETY_EVENT_POLL_SECONDS = float(os.environ.get("SAFETY_EVENT_POLL_SECONDS", "2"))
RECENT_LOCATION_LIMIT = int(os.environ.get("RECENT_LOCATION_LIMIT", "20"))
ETA_MIN_SPEED_METERS_PER_SECOND = float(os.environ.get("ETA_MIN_SPEED_METERS_PER_SECOND", "1.5"))
ETA_MAX_SPEED_METERS_PER_SECOND = float(os.environ.get("ETA_MAX_SPEED_METERS_PER_SECOND", "50"))
