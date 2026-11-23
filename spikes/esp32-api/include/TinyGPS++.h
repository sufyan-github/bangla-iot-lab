// GPS sentences, for the lab's board library.
//
// The same classes and functions as the TinyGPSPlus library for Arduino, so that
// sketches written for it build and run unchanged. This is the lab's own
// implementation, written from the NMEA 0183 sentence format; TinyGPSPlus itself
// is under the LGPL and is not used. Like TinyGPSPlus, it reads the RMC and GGA
// sentences (from any talker: GP, GN, GL...) and checks each sentence's checksum.
#pragma once
#include <Arduino.h>
#include <limits.h>

#define _GPS_VERSION "1.0.3 (lab)"
#define _GPS_MPH_PER_KNOT 1.15077945
#define _GPS_MPS_PER_KNOT 0.51444444
#define _GPS_KMPH_PER_KNOT 1.852
#define _GPS_MILES_PER_METER 0.00062137112
#define _GPS_KM_PER_METER 0.001
#define _GPS_FEET_PER_METER 3.2808399

/** Degrees as whole degrees and billionths, as TinyGPSPlus keeps them. */
struct RawDegrees {
  uint16_t deg = 0;
  uint32_t billionths = 0;
  bool negative = false;
};

class TinyGPSLocation {
 public:
  bool isValid() const { return valid_; }
  bool isUpdated() const { return updated_; }
  uint32_t age() const { return valid_ ? millis() - lastCommit_ : (uint32_t)ULONG_MAX; }
  const RawDegrees& rawLat() { updated_ = false; return lat_; }
  const RawDegrees& rawLng() { updated_ = false; return lng_; }
  double lat();
  double lng();

 private:
  friend class TinyGPSPlus;
  bool valid_ = false, updated_ = false;
  uint32_t lastCommit_ = 0;
  RawDegrees lat_, lng_;
};

class TinyGPSDate {
 public:
  bool isValid() const { return valid_; }
  bool isUpdated() const { return updated_; }
  uint32_t age() const { return valid_ ? millis() - lastCommit_ : (uint32_t)ULONG_MAX; }
  /** ddmmyy */
  uint32_t value() { updated_ = false; return date_; }
  uint16_t year();
  uint8_t month();
  uint8_t day();

 private:
  friend class TinyGPSPlus;
  bool valid_ = false, updated_ = false;
  uint32_t lastCommit_ = 0, date_ = 0;
};

class TinyGPSTime {
 public:
  bool isValid() const { return valid_; }
  bool isUpdated() const { return updated_; }
  uint32_t age() const { return valid_ ? millis() - lastCommit_ : (uint32_t)ULONG_MAX; }
  /** hhmmsscc */
  uint32_t value() { updated_ = false; return time_; }
  uint8_t hour();
  uint8_t minute();
  uint8_t second();
  uint8_t centisecond();

 private:
  friend class TinyGPSPlus;
  bool valid_ = false, updated_ = false;
  uint32_t lastCommit_ = 0, time_ = 0;
};

/** A number with two decimals, kept as hundredths. */
class TinyGPSDecimal {
 public:
  bool isValid() const { return valid_; }
  bool isUpdated() const { return updated_; }
  uint32_t age() const { return valid_ ? millis() - lastCommit_ : (uint32_t)ULONG_MAX; }
  int32_t value() { updated_ = false; return value_; }

 protected:
  friend class TinyGPSPlus;
  bool valid_ = false, updated_ = false;
  uint32_t lastCommit_ = 0;
  int32_t value_ = 0;
};

class TinyGPSInteger {
 public:
  bool isValid() const { return valid_; }
  bool isUpdated() const { return updated_; }
  uint32_t age() const { return valid_ ? millis() - lastCommit_ : (uint32_t)ULONG_MAX; }
  uint32_t value() { updated_ = false; return value_; }

 private:
  friend class TinyGPSPlus;
  bool valid_ = false, updated_ = false;
  uint32_t lastCommit_ = 0, value_ = 0;
};

struct TinyGPSSpeed : TinyGPSDecimal {
  double knots() { return value() / 100.0; }
  double mph() { return _GPS_MPH_PER_KNOT * value() / 100.0; }
  double mps() { return _GPS_MPS_PER_KNOT * value() / 100.0; }
  double kmph() { return _GPS_KMPH_PER_KNOT * value() / 100.0; }
};
struct TinyGPSCourse : TinyGPSDecimal {
  double deg() { return value() / 100.0; }
};
struct TinyGPSAltitude : TinyGPSDecimal {
  double meters() { return value() / 100.0; }
  double miles() { return _GPS_MILES_PER_METER * value() / 100.0; }
  double kilometers() { return _GPS_KM_PER_METER * value() / 100.0; }
  double feet() { return _GPS_FEET_PER_METER * value() / 100.0; }
};
struct TinyGPSHDOP : TinyGPSDecimal {
  double hdop() { return value() / 100.0; }
};

class TinyGPSPlus {
 public:
  /** Takes one character; true when it completed a sentence that passed its checksum. */
  bool encode(char c);
  TinyGPSPlus& operator<<(char c) {
    encode(c);
    return *this;
  }

  TinyGPSLocation location;
  TinyGPSDate date;
  TinyGPSTime time;
  TinyGPSSpeed speed;
  TinyGPSCourse course;
  TinyGPSAltitude altitude;
  TinyGPSInteger satellites;
  TinyGPSHDOP hdop;

  static const char* libraryVersion() { return _GPS_VERSION; }
  /** Great-circle distance in metres between two points given in degrees. */
  static double distanceBetween(double lat1, double long1, double lat2, double long2);
  /** Initial course in degrees from the first point to the second. */
  static double courseTo(double lat1, double long1, double lat2, double long2);
  /** "N", "NNE", ... for a course in degrees. */
  static const char* cardinal(double course);

  uint32_t charsProcessed() const { return chars_; }
  uint32_t sentencesWithFix() const { return withFix_; }
  uint32_t failedChecksum() const { return failed_; }
  uint32_t passedChecksum() const { return passed_; }

 private:
  void endSentence();
  char sentence_[100];
  int length_ = 0;
  bool inSentence_ = false;
  uint32_t chars_ = 0, withFix_ = 0, failed_ = 0, passed_ = 0;
};
