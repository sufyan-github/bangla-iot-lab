// GPS sentences for the lab's board library: see include/TinyGPS++.h.
#include "TinyGPS++.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

namespace {

/** The comma-separated fields of a sentence, after its "$" and before its "*". */
struct Fields {
  const char* at[24];
  int count = 0;
};

Fields split(char* body) {
  Fields f;
  f.at[f.count++] = body;
  for (char* p = body; *p; p++) {
    if (*p == ',') {
      *p = 0;
      if (f.count < 24) f.at[f.count++] = p + 1;
    }
  }
  return f;
}

const char* field(const Fields& f, int n) { return n < f.count ? f.at[n] : ""; }

/** "4807.038" with "N" into whole degrees and billionths, as ddmm.mmmm or dddmm.mmmm. */
bool parseDegrees(const char* text, const char* hemisphere, RawDegrees& out) {
  if (!*text || !*hemisphere) return false;
  double value = atof(text);
  int whole = (int)(value / 100);
  double minutes = value - whole * 100.0;
  double fraction = minutes / 60.0;
  out.deg = (uint16_t)whole;
  out.billionths = (uint32_t)(fraction * 1e9 + 0.5);
  out.negative = *hemisphere == 'S' || *hemisphere == 'W';
  return true;
}

/** "123.45" as hundredths. */
int32_t hundredths(const char* text) { return (int32_t)lround(atof(text) * 100.0); }

/** "hhmmss.ss" as hhmmsscc. */
uint32_t clockOf(const char* text) {
  double value = atof(text);
  uint32_t seconds = (uint32_t)value;
  uint32_t centi = (uint32_t)lround((value - seconds) * 100.0);
  return seconds * 100 + centi;
}

}  // namespace

static double toDegrees(const RawDegrees& d) {
  double value = d.deg + d.billionths / 1e9;
  return d.negative ? -value : value;
}
double TinyGPSLocation::lat() {
  updated_ = false;
  return toDegrees(lat_);
}
double TinyGPSLocation::lng() {
  updated_ = false;
  return toDegrees(lng_);
}
uint16_t TinyGPSDate::year() {
  updated_ = false;
  return (uint16_t)(date_ % 100 + 2000);
}
uint8_t TinyGPSDate::month() {
  updated_ = false;
  return (uint8_t)((date_ / 100) % 100);
}
uint8_t TinyGPSDate::day() {
  updated_ = false;
  return (uint8_t)(date_ / 10000);
}
uint8_t TinyGPSTime::hour() {
  updated_ = false;
  return (uint8_t)(time_ / 1000000);
}
uint8_t TinyGPSTime::minute() {
  updated_ = false;
  return (uint8_t)((time_ / 10000) % 100);
}
uint8_t TinyGPSTime::second() {
  updated_ = false;
  return (uint8_t)((time_ / 100) % 100);
}
uint8_t TinyGPSTime::centisecond() {
  updated_ = false;
  return (uint8_t)(time_ % 100);
}

bool TinyGPSPlus::encode(char c) {
  chars_++;
  if (c == '$') {
    inSentence_ = true;
    length_ = 0;
    return false;
  }
  if (!inSentence_) return false;
  if (c == '\r' || c == '\n') {
    inSentence_ = false;
    sentence_[length_] = 0;
    uint32_t before = passed_;
    endSentence();
    return passed_ != before;
  }
  if (length_ < (int)sizeof(sentence_) - 1) sentence_[length_++] = c;
  else inSentence_ = false;  // too long to be a sentence
  return false;
}

void TinyGPSPlus::endSentence() {
  char* star = strchr(sentence_, '*');
  if (!star) return;
  *star = 0;
  uint8_t sum = 0;
  for (const char* p = sentence_; *p; p++) sum ^= (uint8_t)*p;
  if (strtol(star + 1, nullptr, 16) != sum) {
    failed_++;
    return;
  }
  passed_++;
  Fields f = split(sentence_);
  const char* type = field(f, 0);
  if (strlen(type) < 5) return;
  const char* name = type + strlen(type) - 3;  // after the talker: RMC, GGA...
  uint32_t now = millis();

  if (strcmp(name, "RMC") == 0) {
    bool fix = field(f, 2)[0] == 'A';
    if (*field(f, 1)) {
      time.time_ = clockOf(field(f, 1));
      time.valid_ = time.updated_ = true;
      time.lastCommit_ = now;
    }
    if (*field(f, 9)) {
      date.date_ = (uint32_t)atol(field(f, 9));
      date.valid_ = date.updated_ = true;
      date.lastCommit_ = now;
    }
    if (fix) {
      withFix_++;
      RawDegrees lat, lng;
      if (parseDegrees(field(f, 3), field(f, 4), lat) && parseDegrees(field(f, 5), field(f, 6), lng)) {
        location.lat_ = lat;
        location.lng_ = lng;
        location.valid_ = location.updated_ = true;
        location.lastCommit_ = now;
      }
      speed.value_ = hundredths(field(f, 7));
      speed.valid_ = speed.updated_ = true;
      speed.lastCommit_ = now;
      course.value_ = hundredths(field(f, 8));
      course.valid_ = course.updated_ = true;
      course.lastCommit_ = now;
    }
  } else if (strcmp(name, "GGA") == 0) {
    bool fix = atoi(field(f, 6)) > 0;
    if (*field(f, 1)) {
      time.time_ = clockOf(field(f, 1));
      time.valid_ = time.updated_ = true;
      time.lastCommit_ = now;
    }
    satellites.value_ = (uint32_t)atol(field(f, 7));
    satellites.valid_ = satellites.updated_ = true;
    satellites.lastCommit_ = now;
    hdop.value_ = hundredths(field(f, 8));
    hdop.valid_ = hdop.updated_ = true;
    hdop.lastCommit_ = now;
    if (fix) {
      withFix_++;
      RawDegrees lat, lng;
      if (parseDegrees(field(f, 2), field(f, 3), lat) && parseDegrees(field(f, 4), field(f, 5), lng)) {
        location.lat_ = lat;
        location.lng_ = lng;
        location.valid_ = location.updated_ = true;
        location.lastCommit_ = now;
      }
      altitude.value_ = hundredths(field(f, 9));
      altitude.valid_ = altitude.updated_ = true;
      altitude.lastCommit_ = now;
    }
  }
}

double TinyGPSPlus::distanceBetween(double lat1, double long1, double lat2, double long2) {
  // Haversine, on a sphere of the Earth's mean radius.
  const double radius = 6371000.0;
  double p1 = radians(lat1), p2 = radians(lat2);
  double dp = radians(lat2 - lat1), dl = radians(long2 - long1);
  double a = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2);
  return 2 * radius * atan2(sqrt(a), sqrt(1 - a));
}

double TinyGPSPlus::courseTo(double lat1, double long1, double lat2, double long2) {
  double p1 = radians(lat1), p2 = radians(lat2), dl = radians(long2 - long1);
  double y = sin(dl) * cos(p2);
  double x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl);
  double course = degrees(atan2(y, x));
  return course < 0 ? course + 360 : course;
}

const char* TinyGPSPlus::cardinal(double course) {
  static const char* const directions[] = {"N",  "NNE", "NE", "ENE", "E",  "ESE", "SE", "SSE",
                                           "S",  "SSW", "SW", "WSW", "W",  "WNW", "NW", "NNW"};
  int index = (int)((course + 11.25) / 22.5);
  return directions[index % 16];
}
