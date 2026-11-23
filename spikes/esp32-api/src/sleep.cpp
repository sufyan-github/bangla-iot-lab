// Sleep modes: see include/esp_sleep.h.
#include <esp_sleep.h>

// The RTC memory's bounds, from the linker: every RTC_DATA_ATTR variable lies between them.
extern "C" char __start_rtc_data[];
extern "C" char __stop_rtc_data[];
// One RTC variable of the library's own, so the RTC memory always exists, even in a
// sketch that keeps nothing there.
RTC_DATA_ATTR static uint8_t rtc_present = 1;

static int64_t timer_us = -1;
static int ext0_pin = -1;
static int ext0_level = 0;

esp_err_t esp_sleep_enable_timer_wakeup(uint64_t time_in_us) {
  timer_us = (int64_t)time_in_us;
  return ESP_OK;
}

esp_err_t esp_sleep_enable_ext0_wakeup(gpio_num_t gpio_num, int level) {
  // Only the pins of the RTC domain can wake the chip this way.
  static const int rtc_pins[] = {0, 2, 4, 12, 13, 14, 15, 25, 26, 27, 32, 33, 34, 35, 36, 39};
  for (int pin : rtc_pins) {
    if (pin == (int)gpio_num) {
      ext0_pin = pin;
      ext0_level = level ? 1 : 0;
      return ESP_OK;
    }
  }
  return ESP_ERR_INVALID_ARG;
}

esp_err_t esp_sleep_disable_wakeup_source(esp_sleep_source_t source) {
  if (source == ESP_SLEEP_WAKEUP_TIMER || source == ESP_SLEEP_WAKEUP_ALL) timer_us = -1;
  if (source == ESP_SLEEP_WAKEUP_EXT0 || source == ESP_SLEEP_WAKEUP_ALL) ext0_pin = -1;
  return ESP_OK;
}

esp_sleep_wakeup_cause_t esp_sleep_get_wakeup_cause(void) {
  return (esp_sleep_wakeup_cause_t)host_wakeup_cause();
}

void esp_deep_sleep_start(void) {
  (void)rtc_present;
  host_deep_sleep(timer_us, ext0_pin, ext0_level, __start_rtc_data,
                  (size_t)(__stop_rtc_data - __start_rtc_data));
  for (;;) host_delay_micros(UINT64_MAX / 4);  // not reached: the board starts the program again
}

void esp_deep_sleep(uint64_t time_in_us) {
  esp_sleep_enable_timer_wakeup(time_in_us);
  esp_deep_sleep_start();
}

void EspClass::deepSleep(uint64_t time_us) { esp_deep_sleep(time_us); }

esp_err_t esp_light_sleep_start(void) {
  // Light sleep keeps everything: the program carries on after the timer.
  if (timer_us >= 0) host_delay_micros((uint64_t)timer_us);
  return ESP_OK;
}
