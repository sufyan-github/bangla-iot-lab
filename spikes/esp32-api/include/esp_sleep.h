// Sleep modes of the ESP32, for the lab's board library.
//
// Deep sleep stops the program; the board starts it again from setup(), as
// after a reset, when its timer runs out or a pin (ext0) reaches a level. Only
// variables marked RTC_DATA_ATTR keep their values, as on the chip, where they
// live in the RTC memory that stays powered. Light sleep simply waits for the
// timer, keeping everything.
//
// Not modelled: ext1 and touch wake-ups, the ULP co-processor, and the very
// small current the chip draws while asleep.
#pragma once
#include <Arduino.h>

typedef enum {
  ESP_SLEEP_WAKEUP_UNDEFINED = 0,
  ESP_SLEEP_WAKEUP_ALL = 1,
  ESP_SLEEP_WAKEUP_EXT0 = 2,
  ESP_SLEEP_WAKEUP_EXT1 = 3,
  ESP_SLEEP_WAKEUP_TIMER = 4,
  ESP_SLEEP_WAKEUP_TOUCHPAD = 5,
  ESP_SLEEP_WAKEUP_ULP = 6,
  ESP_SLEEP_WAKEUP_GPIO = 7,
  ESP_SLEEP_WAKEUP_UART = 8,
} esp_sleep_wakeup_cause_t;

typedef esp_sleep_wakeup_cause_t esp_sleep_source_t;

esp_err_t esp_sleep_enable_timer_wakeup(uint64_t time_in_us);
esp_err_t esp_sleep_enable_ext0_wakeup(gpio_num_t gpio_num, int level);
esp_err_t esp_sleep_disable_wakeup_source(esp_sleep_source_t source);
esp_sleep_wakeup_cause_t esp_sleep_get_wakeup_cause(void);
[[noreturn]] void esp_deep_sleep_start(void);
[[noreturn]] void esp_deep_sleep(uint64_t time_in_us);
esp_err_t esp_light_sleep_start(void);
